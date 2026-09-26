import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Copy } from "./typography";
import { Panel } from "./surfaces";

export type NativeFormProps = Readonly<{ children: ReactNode }>;

export type FormSectionProps = Readonly<{ title: string; children: ReactNode }>;

export function NativeForm({ children }: NativeFormProps) {
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

export function FormSection({ title, children }: FormSectionProps) {
  return (
    <View style={{ gap: 12 }}>
      <Copy accessibilityRole="header" weight="600">
        {title}
      </Copy>
      <Panel style={{ gap: 12 }}>{children}</Panel>
    </View>
  );
}
