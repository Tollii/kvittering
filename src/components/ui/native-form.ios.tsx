import { useState } from "react";
import { Form, Host, RNHostView, Section, VStack } from "@expo/ui/swift-ui";
import {
  frame,
  onGeometryChange,
  scrollContentBackground,
} from "@expo/ui/swift-ui/modifiers";
import { View } from "react-native";
import { useTheme } from "@/constants/theme";
import type { FormSectionProps, NativeFormProps } from "./native-form";

export function NativeForm({ children }: NativeFormProps) {
  const colors = useTheme();

  return (
    <Host style={{ flex: 1 }} seedColor={colors.primary}>
      <Form modifiers={[scrollContentBackground("hidden")]}>{children}</Form>
    </Host>
  );
}

export function FormSection({ title, children }: FormSectionProps) {
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
