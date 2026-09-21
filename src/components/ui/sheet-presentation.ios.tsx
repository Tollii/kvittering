import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  interactiveDismissDisabled,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { View, useWindowDimensions } from "react-native";
import { useTheme } from "@/constants/theme";
import type { SheetPresentationProps } from "./sheet-presentation";

export function SheetPresentation({
  visible,
  onClose,
  dismissible = true,
  children,
}: SheetPresentationProps) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();

  return (
    <Host style={{ position: "absolute", width: 0, height: 0 }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(shown) => {
          if (!shown) onClose();
        }}
      >
        <Group
          modifiers={[
            presentationDetents(
              fontScale > 1.3 ? ["large"] : ["medium", "large"],
            ),
            presentationDragIndicator("visible"),
            presentationBackground(colors.background),
            interactiveDismissDisabled(!dismissible),
          ]}
        >
          <RNHostView>
            <View style={{ flex: 1 }}>{children}</View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
