import { View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

interface AuthenticatorLogoProps {
  size?: number;
  enabled?: boolean;
}

export default function AuthenticatorLogo({ size = 60, enabled = false }: AuthenticatorLogoProps) {
  const center = 50;
  const barLength = 70;
  const barWidth = 14;
  
  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G>
          {/* Yellow bar - diagonal at -45 degrees (top-left to bottom-right) */}
          <Rect 
            x={center - barLength / 2}
            y={center - barWidth / 2}
            width={barLength}
            height={barWidth}
            fill="#FBC02D" 
            rx={barWidth / 2}
            transform={`rotate(-45 ${center} ${center})`}
          />
          
          {/* Blue bar - diagonal at 45 degrees (top-right to bottom-left) */}
          <Rect 
            x={center - barLength / 2}
            y={center - barWidth / 2}
            width={barLength}
            height={barWidth}
            fill="#1E88E5" 
            rx={barWidth / 2}
            transform={`rotate(45 ${center} ${center})`}
          />
          
          {/* Red bar - vertical at 90 degrees */}
          <Rect 
            x={center - barLength / 2}
            y={center - barWidth / 2}
            width={barLength}
            height={barWidth}
            fill="#D32F2F" 
            rx={barWidth / 2}
            transform={`rotate(90 ${center} ${center})`}
          />
        </G>
      </Svg>
    </View>
  );
}
