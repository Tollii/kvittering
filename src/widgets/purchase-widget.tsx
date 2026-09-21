import { Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  privacySensitive,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { PurchaseWidgetData } from "@/lib/purchase-widget-data";

const PurchaseWidget = (
  props: PurchaseWidgetData,
  environment: WidgetEnvironment,
) => {
  "widget";

  const textStyle =
    environment.widgetRenderingMode === "fullColor"
      ? foregroundStyle("#F6F3EA")
      : foregroundStyle({ type: "hierarchical", style: "primary" });

  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        containerBackground("#263CC7", "widget"),
        textStyle,
        widgetURL("kvitto:///(tabs)/spending"),
      ]}
    >
      <Text modifiers={[font({ size: 13, weight: "semibold" })]}>
        {props.month || "Dagligvarer"}
      </Text>
      <Text
        modifiers={[
          font({ size: 24, weight: "bold" }),
          lineLimit(1),
          minimumScaleFactor(0.6),
          privacySensitive(),
        ]}
      >
        {props.amount || "Åpne Kvitto"}
      </Text>
      <Text modifiers={[font({ size: 12 }), privacySensitive()]}>
        {props.budget || "Se forbruket for å oppdatere"}
      </Text>
      <Spacer />
      {environment.widgetFamily === "systemMedium" && (
        <Link
          destination="kvitto:///(tabs)"
          label="Skann kvittering"
          modifiers={[font({ size: 14, weight: "semibold" })]}
        />
      )}
      <Text modifiers={[font({ size: 10 })]}>{props.updated || ""}</Text>
    </VStack>
  );
};

export default createWidget("PurchaseWidget", PurchaseWidget);
