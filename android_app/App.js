import { useEffect, useState } from 'react'
import { View, ActivityIndicator, Platform, AppState, Linking } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { ShareIntentProvider } from 'expo-share-intent'
import { supabase } from './src/supabaseClient'
import { flushPendingCaptures } from './src/pendingCaptureQueue'
import { colors } from './src/theme'
import SplashScreen from './src/screens/SplashScreen'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import ChatScreen from './src/screens/ChatScreen'
import ShareIntentHandler from './src/ShareIntentHandler'

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.canvas,
    card: colors.surface,
    text: colors.text,
    border: colors.borderSubtle,
    primary: colors.black,
  },
}

const Tab = createBottomTabNavigator()

function authParamsFromUrl(url) {
  if (!url) return null
  const queryIndex = url.indexOf('?')
  const hashIndex = url.indexOf('#')
  const raw = hashIndex >= 0
    ? url.slice(hashIndex + 1)
    : queryIndex >= 0
      ? url.slice(queryIndex + 1)
      : ''

  if (!raw) return null
  const params = new URLSearchParams(raw)
  return {
    type: params.get('type'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  }
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [splashDone, setSplashDone] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    let mounted = true

    const handleAuthLink = async (url) => {
      const params = authParamsFromUrl(url)
      if (!params?.accessToken || !params?.refreshToken) return

      if (params.type === 'recovery') setRecoveryMode(true)
      const { data, error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      })
      if (!error && mounted) setSession(data.session)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session)
    })

    Linking.getInitialURL().then((url) => handleAuthLink(url).catch(() => {}))
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleAuthLink(url).catch(() => {})
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      setSession(newSession)
      if (newSession && event !== 'PASSWORD_RECOVERY') flushPendingCaptures().catch(() => {})
    })

    return () => {
      mounted = false
      linkSub.remove()
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || recoveryMode) return undefined

    flushPendingCaptures().catch(() => {})
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushPendingCaptures().catch(() => {})
    })
    return () => sub.remove()
  }, [session, recoveryMode])

  if (!splashDone) {
    return (
      <>
        <SplashScreen onDone={() => setSplashDone(true)} />
        <StatusBar style="dark" />
      </>
    )
  }

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.black} />
      </View>
    )
  }

  if (!session || recoveryMode) {
    return (
      <ShareIntentProvider>
        <LoginScreen recoveryMode={recoveryMode} onRecoveryComplete={() => setRecoveryMode(false)} />
        <StatusBar style="dark" />
      </ShareIntentProvider>
    )
  }

  return (
    <ShareIntentProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="dark" />
        <ShareIntentHandler />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarHideOnKeyboard: true,
            tabBarShowLabel: true,
            tabBarActiveTintColor: colors.black,
            tabBarInactiveTintColor: colors.textFaint,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.borderSubtle,
              height: Platform.OS === 'ios' ? 84 : 66,
              paddingTop: 7,
              paddingBottom: Platform.OS === 'ios' ? 27 : 9,
              elevation: 0,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
        >
          <Tab.Screen
            name="Memories"
            component={DashboardScreen}
            options={{
              tabBarIcon: ({ color, focused, size }) => (
                <Ionicons name={focused ? 'albums' : 'albums-outline'} color={color} size={size ?? 23} />
              ),
            }}
          />
          <Tab.Screen
            name="Ask"
            component={ChatScreen}
            options={{
              tabBarIcon: ({ color, focused, size }) => (
                <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} color={color} size={size ?? 23} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </ShareIntentProvider>
  )
}
