import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function StarRating({ rating, onRate, size = 20 }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onRate && onRate(star === rating ? 0 : star)}
          disabled={!onRate}
          activeOpacity={0.7}
        >
          <Ionicons
            name={rating >= star ? 'star' : 'star-outline'}
            size={size}
            color={rating >= star ? '#FFB800' : '#CAC4D0'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}
