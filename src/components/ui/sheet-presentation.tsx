import type { ReactNode } from "react";
import { Modal } from "react-native";

export type SheetPresentationProps = Readonly<{
  visible: boolean;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}>;

export function SheetPresentation({
  visible,
  onClose,
  children,
}: SheetPresentationProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {children}
    </Modal>
  );
}
