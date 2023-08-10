import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  isTyping: boolean;
}

const TypingIndicator = ({ isTyping }: Props) => {
  if (!isTyping) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>User is typing...</Text>
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