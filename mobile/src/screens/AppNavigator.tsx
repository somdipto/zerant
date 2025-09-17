import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { hasApiKey } from '../services/SecureStorage';
import APIKeyInputScreen from './APIKeyInputScreen';
import AgentScreen from './AgentScreen';

const Stack = createStackNavigator();

// Enable React Native Gesture Handler
import { enableScreens } from 'react-native-screens';
enableScreens();

const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasValidKey, setHasValidKey] = useState(false);

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const isValid = await hasApiKey();
        setHasValidKey(isValid);
      } catch (error) {
        console.error('Error checking API key:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkApiKey();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!hasValidKey ? (
          <Stack.Screen name="APIKeyInput" component={APIKeyInputScreen} />
        ) : (
          <Stack.Screen name="Agent" component={AgentScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
