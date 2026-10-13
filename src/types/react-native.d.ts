import type { TextProps } from "react-native";

// React Native forwards `dynamicTypeRamp` to the native input on iOS, but its
// types declare it only on `Text`. `Field` sets it.
declare module "react-native" {
  interface TextInputProps {
    dynamicTypeRamp?: TextProps["dynamicTypeRamp"];
  }
}
