import { releaseMutation } from "@/lib/releases/requests";
import { useRef, useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Copy, Icon } from "@/components/ui";
import { radius, useTheme } from "@/constants/theme";
import type { Receipt } from "@/lib/domain/insights";
import { aliasKey } from "@/lib/domain/receipt";
import {
  canConfirmSuggestedCategory,
  quickApproveData,
} from "@/lib/domain/receipt-review";
import { errorFeedback, successFeedback } from "@/lib/haptics";

/**
 * Swipe a receipt card left to approve it, when the only open questions are
 * suggested categories. Everything else still needs the full review screen.
 */
export function SwipeToApprove({
  receipt,
  enabled,
  children,
}: {
  receipt: Receipt;
  enabled: boolean;
  children: ReactNode;
}) {
  const colors = useTheme();
  const client = useConvex();
  const swipeable = useRef<SwipeableMethods>(null);
  const [busy, setBusy] = useState(false);

  const unresolvedDuplicate =
    !!receipt.duplicateOf && !receipt.duplicateResolved;

  const approvable =
    enabled &&
    receipt.status === "needs_review" &&
    !!quickApproveData(receipt.data, unresolvedDuplicate);

  if (!approvable) return <>{children}</>;

  async function approve() {
    if (busy) return;
    const data = quickApproveData(receipt.data, unresolvedDuplicate);

    if (!data) return;
    setBusy(true);

    try {
      await releaseMutation(client, api.receipts.save, {
        id: receipt._id,
        revision: receipt.revision,
        data,
        reviewed: true,
        rememberLineIds: receipt
          .data!.lines.filter(canConfirmSuggestedCategory)
          .filter((line) => aliasKey(data, line) !== null)
          .map((line) => line.id),
        duplicateResolved: receipt.duplicateResolved,
        excluded: receipt.excluded,
      });
      successFeedback();
    } catch (cause) {
      errorFeedback();
      swipeable.current?.close();
      Alert.alert(
        "Kunne ikke godkjenne",
        cause instanceof Error ? cause.message : "Prøv igjen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={72}
      overshootRight={false}
      enabled={!busy}
      onSwipeableOpen={(direction) => {
        if (String(direction) === "right") void approve();
      }}
      renderRightActions={() => (
        <View
          accessibilityElementsHidden
          style={{
            width: 112,
            marginLeft: 8,
            borderRadius: radius.card,
            borderCurve: "continuous",
            backgroundColor: colors.success,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Icon name="checkmark.seal" size={22} color="#FFFFFF" />
          <Copy size={13} weight="700" style={{ color: "#FFFFFF" }}>
            Godkjenn
          </Copy>
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
