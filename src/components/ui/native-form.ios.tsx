import { useState, type ReactNode } from "react";
import { Form, Host, RNHostView, Section, VStack } from "@expo/ui/swift-ui";
import {
  frame,
  onGeometryChange,
  scrollContentBackground,
} from "@expo/ui/swift-ui/modifiers";
import { View } from "react-native";
import { useTheme } from "@/constants/theme";

export function NativeForm({ children }: Readonly<{ children: ReactNode }>) {
  const colors = useTheme();

  return (
    <Host style={{ flex: 1 }} seedColor={colors.primary}>
      <Form modifiers={[scrollContentBackground("hidden")]}>{children}</Form>
    </Host>
  );
}

export function FormSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  // Measure the native row before text can establish an unconstrained width.
  const [width, setWidth] = useState(0);

  return (
    <Section title={title}>
      <VStack
        modifiers={[
          frame({ maxWidth: Infinity, alignment: "leading" }),
          onGeometryChange((geometry) => setWidth(geometry.width)),
        ]}
      >
        {width > 0 && (
          <RNHostView matchContents>
            <View style={{ width, gap: 12 }}>{children}</View>
          </RNHostView>
        )}
      </VStack>
    </Section>
  );
}
