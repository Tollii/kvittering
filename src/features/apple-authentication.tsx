import { useEffect, useState } from "react";
import { useColorScheme, useWindowDimensions, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Copy } from "@/components/ui";

/** Unsupported platforms and older binaries keep email authentication. */
export function useAppleAuthentication() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    void AppleAuthentication.isAvailableAsync()
      .catch(() => false)
      .then((supported) => {
        if (active) setAvailable(supported);
      });

    return () => {
      active = false;
    };
  }, []);

  return available;
}

export function AppleAuthenticationButton({
  busy,
  disabled = false,
  onPress,
}: Readonly<{
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}>) {
  const dark = useColorScheme() === "dark";
  const { fontScale } = useWindowDimensions();
  const height = Math.max(56, 44 * fontScale);

  return (
    <View
      pointerEvents={busy || disabled ? "none" : "auto"}
      accessibilityState={{ busy, disabled: busy || disabled }}
      style={{ gap: 8 }}
    >
      <AppleAuthentication.AppleAuthenticationButton
        accessibilityState={{ busy, disabled: busy || disabled }}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          dark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={height / 2}
        style={{ height, width: "100%" }}
        onPress={() => {
          if (!busy && !disabled) onPress();
        }}
      />
      {busy && (
        <Copy muted style={{ textAlign: "center" }}>
          Venter på Apple …
        </Copy>
      )}
    </View>
  );
}
