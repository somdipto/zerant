import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Hub from '../components/Hub';
import { colors } from '../constants';

const HubScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Hub</Text>
      <Hub />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    padding: 20,
    paddingTop: 10,
  },
});

export default HubScreen;