import { useEffect, useState } from 'react'
import { View, ActivityIndicator, Platform, AppState } from 'react-native'
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

export default function App() {
  const [session, setSession] = useState(undefined)
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) flushPendingCaptures().catch(() => {})
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return undefined

    flushPendingCaptures().catch(() => {})
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushPendingCaptures().catch(() => {})
    })
    return () => sub.remove()
  }, [session])

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

  if (!session) {
    return (
      <ShareIntentProvider>
        <LoginScreen />
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
