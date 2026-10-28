import {
  Capsule,
  Circle,
  HStack,
  Image,
  ProgressView,
  Rectangle,
  Text,
  VStack,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  activityBackgroundTint,
  clipped,
  contentTransition,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  progressViewStyle,
  strokeBorder,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";
import type { ReceiptActivityProgress } from "@/lib/domain/receipt-activity";

export default createLiveActivity(
  "ReceiptActivity",
  (props: ReceiptActivityProgress, environment) => {
    "widget";

    // The lock screen banner sits on the light `hero` cobalt, so it draws `onHero`,
    // `onHeroMuted`, `heroTrack`, and `heroWarning`. The Dynamic Island is always
    // black, so it draws the dark scheme's `primary`, `text`, `secondary`, and `warning`.
    const banner = {
      ink: "#FFFFFF",
      muted: "#E3E7FF",
      track: "#FFFFFF33",
      warning: "#FFE3A1",
    };

    const island = {
      ink: "#F6F3EA",
      muted: "#B3BAD2",
      accent: "#A5B7FF",
      track: "#FFFFFF26",
      warning: "#E5CE6A",
    };

    const settled = props.completed + props.failed === props.total;

    const title = environment.isStale
      ? "Åpne Kvitto for siste status"
      : props.ended
        ? settled
          ? "Kvitteringene er lest"
          : "Behandlingen er avsluttet"
        : "Leser kvitteringer …";

    const count = `${props.completed} av ${props.total}`;
    const failure = `${props.failed} trenger et nytt forsøk`;
    const summary = `${count} klare`;
    const finished = props.ended && settled && props.failed === 0;

    /** The arch from the app icon: two capsules with their lower halves clipped off. */
    const arch = (width: number, color: string) => {
      const height = width * 1.165;
      const inner = width * 0.417;

      const half = (size: number, rise: number, line: number) => (
        <Rectangle
          modifiers={[
            foregroundStyle("clear"),
            strokeBorder({
              content: color,
              // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- strokeBorder names this parameter.
              shape: "capsule",
              style: { lineWidth: line },
            }),
            frame({ width: size, height: rise + size / 2 }),
            frame({ height: rise, alignment: "top" }),
            clipped(),
          ]}
        />
      );

      return (
        <ZStack
          alignment="bottom"
          modifiers={[frame({ width, height }), accessibilityHidden(true)]}
        >
          {half(width, height, width * 0.125)}
          <ZStack modifiers={[padding({ bottom: width * 0.169 })]}>
            {half(inner, width * 0.704, width * 0.083)}
          </ZStack>
        </ZStack>
      );
    };

    /** One segment per receipt, settled ones first, so a failure stays visible. */
    const segments = (colors: {
      ink: string;
      track: string;
      warning: string;
    }) => (
      <HStack
        spacing={props.total > 12 ? 2 : 4}
        modifiers={[accessibilityHidden(true)]}
      >
        {Array.from({ length: props.total }, (_, index) => (
          <Capsule
            key={index}
            modifiers={[
              foregroundStyle(
                index < props.completed
                  ? colors.ink
                  : index < props.completed + props.failed
                    ? colors.warning
                    : colors.track,
              ),
              frame({ height: 6 }),
            ]}
          />
        ))}
      </HStack>
    );

    const retry = (text: string, warning: string) =>
      props.failed > 0 && (
        <HStack spacing={6}>
          <Image
            systemName="arrow.clockwise.circle"
            modifiers={[
              foregroundStyle(warning),
              font({ textStyle: "footnote", weight: "semibold" }),
            ]}
          />
          <Text
            modifiers={[
              foregroundStyle(text),
              font({ textStyle: "footnote" }),
              lineLimit(1),
            ]}
          >
            {failure}
          </Text>
        </HStack>
      );

    const ring = (size: number) => (
      <ProgressView
        value={props.total > 0 ? props.completed / props.total : 0}
        modifiers={[
          progressViewStyle("circular"),
          tint(island.accent),
          frame({ width: size, height: size }),
        ]}
      />
    );

    const mark = finished ? (
      <Image
        systemName="checkmark.circle"
        modifiers={[
          foregroundStyle(banner.ink),
          font({ textStyle: "subheadline", weight: "semibold" }),
        ]}
      />
    ) : (
      arch(14, banner.ink)
    );

    return {
      banner: (
        <VStack
          alignment="leading"
          spacing={10}
          modifiers={[
            padding({ vertical: 16, horizontal: 18 }),
            activityBackgroundTint("#263CC7"),
            foregroundStyle(banner.ink),
          ]}
        >
          <HStack spacing={8}>
            {mark}
            <Text
              modifiers={[
                font({ textStyle: "subheadline", weight: "semibold" }),
                lineLimit(1),
              ]}
            >
              {title}
            </Text>
          </HStack>
          <HStack
            alignment="firstTextBaseline"
            spacing={6}
            modifiers={[accessibilityElement("combine")]}
          >
            <Text
              modifiers={[
                font({ textStyle: "largeTitle", weight: "bold" }),
                contentTransition("numericText"),
                lineLimit(1),
                minimumScaleFactor(0.7),
              ]}
            >
              {count}
            </Text>
            <Text
              modifiers={[
                font({ textStyle: "body" }),
                foregroundStyle(banner.muted),
              ]}
            >
              klare
            </Text>
          </HStack>
          {segments(banner)}
          {retry(banner.muted, banner.warning)}
        </VStack>
      ),
      bannerSmall: (
        <HStack
          spacing={8}
          modifiers={[
            padding({ all: 12 }),
            activityBackgroundTint("#263CC7"),
            foregroundStyle(banner.ink),
          ]}
        >
          {arch(12, banner.ink)}
          <Text
            modifiers={[
              font({ textStyle: "headline" }),
              contentTransition("numericText"),
              accessibilityLabel(summary),
            ]}
          >
            {count}
          </Text>
        </HStack>
      ),
      compactLeading: (
        <ZStack modifiers={[padding({ leading: 4 })]}>
          {arch(13, island.accent)}
        </ZStack>
      ),
      compactTrailing: (
        <ZStack modifiers={[accessibilityLabel(summary)]}>{ring(20)}</ZStack>
      ),
      minimal: (
        <ZStack modifiers={[accessibilityLabel(summary)]}>
          {ring(22)}
          {arch(8, island.accent)}
        </ZStack>
      ),
      expandedLeading: (
        <ZStack modifiers={[padding({ leading: 4, top: 4 })]}>
          <Circle
            modifiers={[
              foregroundStyle("#263CC7"),
              frame({ width: 40, height: 40 }),
            ]}
          />
          {finished ? (
            <Image
              systemName="checkmark"
              modifiers={[
                foregroundStyle(banner.ink),
                font({ textStyle: "body", weight: "semibold" }),
              ]}
            />
          ) : (
            arch(16, banner.ink)
          )}
        </ZStack>
      ),
      expandedTrailing: (
        <Text
          modifiers={[
            font({ textStyle: "title2", weight: "bold" }),
            foregroundStyle(island.ink),
            contentTransition("numericText"),
            accessibilityLabel(summary),
            padding({ trailing: 4, top: 10 }),
          ]}
        >
          {count}
        </Text>
      ),
      expandedCenter: (
        <Text
          modifiers={[
            font({ textStyle: "subheadline", weight: "semibold" }),
            foregroundStyle(island.ink),
            lineLimit(1),
            padding({ top: 12 }),
          ]}
        >
          {title}
        </Text>
      ),
      expandedBottom: (
        <VStack
          alignment="leading"
          spacing={10}
          modifiers={[padding({ horizontal: 4, top: 6, bottom: 4 })]}
        >
          {segments({
            ink: island.accent,
            track: island.track,
            warning: island.warning,
          })}
          {retry(island.muted, island.warning)}
        </VStack>
      ),
    };
  },
);
