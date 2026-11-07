/**
 * MedChat Mobile App - App Navigator
 * Main navigation configuration
 */

import React, { useContext } from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';

// Import screens
import SplashScreen from '../screens/SplashScreen';
import ModeSelectionScreen from '../screens/ModeSelectionScreen';
import PatientSetupScreen from '../screens/PatientSetupScreen';
import QRCodeScreen from '../screens/QRCodeScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import DoctorLoginScreen from '../screens/DoctorLoginScreen';
import DoctorRegisterScreen from '../screens/DoctorRegisterScreen';
import DoctorHomeScreen from '../screens/DoctorHomeScreen';
import PatientHomeScreen from '../screens/PatientHomeScreen';
import AddChatScreen from '../screens/AddChatScreen';
import DoctorInfoScreen from '../screens/DoctorInfoScreen';
import PaymentScreen from '../screens/PaymentScreen';
import PatientFilesScreen from '../screens/PatientFilesScreen';
import ConsentScreen from '../screens/ConsentScreen';
import BackupScreen from '../screens/BackupScreen';

// Create navigators
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Placeholder for features under development
function ComingSoonScreen({ route }) {
  const title = (route.params && route.params.title) || 'Раздел в разработке';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.primary }}>
      <MaterialIcons name="construction" size={48} color={colors.text.tertiary} />
      <Text style={{ marginTop: spacing[2], color: colors.text.secondary, fontSize: 16 }}>
        {title}
      </Text>
    </View>
  );
}

// Tab icons
const getTabIcon = (routeName, focused, color, size) => {
  let iconName;

  switch (routeName) {
    case 'Chats':
      iconName = focused ? 'chat' : 'chat-bubble-outline';
      break;
    case 'QRScanner':
      iconName = focused ? 'qr-code' : 'qr-code-2';
      break;
    case 'Appointments':
      iconName = focused ? 'event' : 'event-note';
      break;
    case 'Settings':
      iconName = focused ? 'settings' : 'settings-outlined';
      break;
    case 'Home':
      iconName = focused ? 'home' : 'home-outlined';
      break;
    default:
      iconName = 'help';
  }

  return <MaterialIcons name={iconName} size={size} color={color} />;
};

// Patient Tab Navigator
function PatientTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => getTabIcon(route.name, focused, color, size),
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.text.tertiary,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 12,
          marginBottom: spacing[1],
        },
        tabBarStyle: {
          paddingTop: spacing[1],
          paddingBottom: spacing[2],
          height: 60,
        },
      })}
    >
      <Tab.Screen name="Home" component={PatientHomeScreen} options={{ title: 'Главная' }} />
      <Tab.Screen name="Chats" component={ChatListScreen} options={{ title: 'Чаты' }} />
      <Tab.Screen name="QRScanner" component={PatientSetupScreen} options={{ title: 'QR' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
    </Tab.Navigator>
  );
}

// Doctor Tab Navigator
function DoctorTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => getTabIcon(route.name, focused, color, size),
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.text.tertiary,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 12,
          marginBottom: spacing[1],
        },
        tabBarStyle: {
          paddingTop: spacing[1],
          paddingBottom: spacing[2],
          height: 60,
        },
      })}
    >
      <Tab.Screen name="Home" component={DoctorHomeScreen} options={{ title: 'Главная' }} />
      <Tab.Screen name="Chats" component={ChatListScreen} options={{ title: 'Чаты' }} />
      <Tab.Screen name="Appointments" component={ComingSoonScreen} options={{ title: 'Записи' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
    </Tab.Navigator>
  );
}

// Auth Stack Navigator
function AuthStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.background.primary },
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="ModeSelection" component={ModeSelectionScreen} />
      <Stack.Screen name="PatientSetup" component={PatientSetupScreen} />
      <Stack.Screen name="DoctorLogin" component={DoctorLoginScreen} />
      <Stack.Screen name="DoctorRegister" component={DoctorRegisterScreen} />
      <Stack.Screen name="Consent" component={ConsentScreen} />
    </Stack.Navigator>
  );
}

// Patient Stack Navigator
function PatientStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="PatientMain"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background.primary },
      }}
    >
      <Stack.Screen name="PatientMain" component={PatientTabNavigator} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Chats" component={ChatListScreen} />
      <Stack.Screen name="AddChat" component={AddChatScreen} />
      <Stack.Screen name="DoctorInfo" component={DoctorInfoScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="Consent" component={ConsentScreen} />
      <Stack.Screen name="Backup" component={BackupScreen} />
      <Stack.Screen name="QRCode" component={QRCodeScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

// Doctor Stack Navigator
function DoctorStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="DoctorMain"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background.primary },
      }}
    >
      <Stack.Screen name="DoctorMain" component={DoctorTabNavigator} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Chats" component={ChatListScreen} />
      <Stack.Screen name="PatientFiles" component={PatientFilesScreen} />
      <Stack.Screen name="DoctorInfo" component={DoctorInfoScreen} />
      <Stack.Screen name="Consent" component={ConsentScreen} />
      <Stack.Screen name="Backup" component={BackupScreen} />
      <Stack.Screen name="Appointments" component={ComingSoonScreen} />
      <Stack.Screen name="EPrescriptions" component={ComingSoonScreen} />
      <Stack.Screen name="QRCode" component={QRCodeScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

// Main App Navigator
function AppNavigator() {
  const { state } = useContext(AuthContext);
  const { isAuthenticated, user } = state;

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <AuthStackNavigator />
      ) : user?.role === 'doctor' ? (
        <DoctorStackNavigator />
      ) : (
        <PatientStackNavigator />
      )}
    </NavigationContainer>
  );
}

export default AppNavigator;
