import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  addressesTyping: string[];
}

const TypingIndicator = ({ addressesTyping }: Props) => {
  if (addressesTyping.length === 0) return null;

  if (addressesTyping.length === 1) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>{addressesTyping[0]} is typing...</Text>
        </View>
      );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{addressesTyping.length} addresses are typing...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',  // Ensures the indicator floats on top
    top: 10,
    alignSelf: 'center',
    zIndex: 1,
    borderRadius: 8,
    backgroundColor: "#B0B0B0",
  },
  text: {
    padding: 10,
    color: '#333',
  },
});
export default TypingIndicator;