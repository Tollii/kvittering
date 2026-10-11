import { useEffect, type ReactNode } from "react";
import { Modal } from "react-native";

export type SheetPresentationProps = Readonly<{
  visible: boolean;
  onClose: () => void;
  /** After the sheet has finished leaving the screen. */
  onDismissed: () => void;
  dismissible?: boolean;
  children: ReactNode;
}>;

export function SheetPresentation({
  visible,
  onClose,
  onDismissed,
  dismissible = true,
  children,
}: SheetPresentationProps) {
  // Modal reports its dismissal only on iOS, so elsewhere wait out its slide.
  useEffect(() => {
    if (visible) return undefined;
    const timeout = setTimeout(onDismissed, modalSlide);

    return () => clearTimeout(timeout);
  }, [visible, onDismissed]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      {children}
    </Modal>
  );
}

/** Longer than the Modal's slide animation. */
const modalSlide = 500;
