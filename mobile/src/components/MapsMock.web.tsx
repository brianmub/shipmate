import * as React from 'react';
import { View, Text } from 'react-native';

const MapView = ({ children, style }: any) => (
  <View style={[{ backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }, style]}>
    <Text>Map View (Web Placeholder)</Text>
    {children}
  </View>
);

export const Marker = ({ children }: any) => (
  <View>
    <Text>📍</Text>
    {children}
  </View>
);

export const Polyline = () => null;
export const Callout = ({ children }: any) => <View>{children}</View>;
export const Polygon = () => null;
export const Circle = () => null;
export const Heatmap = () => null;
export const Overlay = () => null;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = 'default';

export default MapView;
