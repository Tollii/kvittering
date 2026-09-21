import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Copy } from "./typography";
import { Panel } from "./surfaces";

export function NativeForm({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ScrollView
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 16 }}
    >
      {children}
    </ScrollView>
  );
}

export function FormSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <View style={{ gap: 12 }}>
      <Copy accessibilityRole="header" weight="600">
        {title}
      </Copy>
      <Panel style={{ gap: 12 }}>{children}</Panel>
    </View>
  );
}
