import { Image, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";
import type { ReceiptActivityProgress } from "@/lib/domain/receipt-activity";

export default createLiveActivity(
  "ReceiptActivity",
  (props: ReceiptActivityProgress, environment) => {
    "widget";

    const title = environment.isStale
      ? "Åpne Kvitto for siste status"
      : props.ended
        ? "Behandlingen er avsluttet"
        : "Behandler kvitteringer";

    const count = `${props.completed} av ${props.total} klare`;

    return {
      banner: (
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[padding({ all: 16 })]}
        >
          <Text modifiers={[font({ weight: "semibold" })]}>{title}</Text>
          <Text>{count}</Text>
          {props.failed > 0 && (
            <Text>{`${props.failed} trenger et nytt forsøk`}</Text>
          )}
        </VStack>
      ),
      compactLeading: (
        <Image systemName="receipt" modifiers={[foregroundStyle("#7488FF")]} />
      ),
      compactTrailing: <Text>{`${props.completed}/${props.total}`}</Text>,
      minimal: <Image systemName="receipt" />,
      expandedCenter: <Text>{title}</Text>,
      expandedBottom: <Text>{count}</Text>,
    };
  },
);
