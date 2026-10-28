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
  dynamicTypeSize,
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

    // Literal tokens; see docs/design-system/foundations.md#widgets.
    const hero = "#263CC7"; // hero

    const banner = {
      ink: "#FFFFFF", // onHero
      muted: "#E3E7FF", // onHeroMuted
      fill: "#FFFFFF", // onHero
      track: "#FFFFFF33", // heroTrack
      warning: "#FFE3A1", // heroWarning
    };

    const island = {
      ink: "#F6F3EA", // dark text
      muted: "#B3BAD2", // dark secondary
      fill: "#A5B7FF", // dark primary
      track: "#FFFFFF33", // heroTrack
      warning: "#E5CE6A", // dark warning
    };

    type Palette = typeof banner;

    const phase = environment.isStale
      ? "stale"
      : !props.ended
        ? "reading"
        : props.total > 0 && props.completed === props.total
          ? "done"
          : "stopped";

    const title = {
      stale: "Åpne Kvitto for siste status",
      reading: "Leser kvitteringer …",
      done: "Kvitteringene er lest",
      stopped: "Behandlingen er avsluttet",
    }[phase];

    const count = `${props.completed} av ${props.total}`;
    const summary = `${count} klare`;

    /**
     * The arch of the app icon (assets/artwork/app-icon.svg, and `ArchMark`) on its
     * 24 × 28 grid: two stroked capsules whose bottom caps are clipped off.
     */
    const arch = (width: number, color: string) => {
      const unit = width / 24;

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
          modifiers={[
            frame({ width, height: 28 * unit }),
            accessibilityHidden(true),
          ]}
        >
          {half(24 * unit, 28 * unit, 3 * unit)}
          <ZStack modifiers={[padding({ bottom: 4 * unit })]}>
            {half(10 * unit, 17 * unit, 2 * unit)}
          </ZStack>
        </ZStack>
      );
    };

    /** A checkmark once every receipt is read, otherwise the arch. */
    const glyph = (width: number, color: string) =>
      phase === "done" ? (
        <Image
          systemName="checkmark"
          modifiers={[
            foregroundStyle(color),
            font({ size: width, weight: "bold" }),
            accessibilityHidden(true),
          ]}
        />
      ) : (
        arch(width, color)
      );

    /** One segment per receipt, read ones first, so a failure stays visible. */
    const segments = (palette: Palette) => (
      <HStack
        // Tighter gaps keep up to 30 segments (`liveActivityReceiptLimit`) legible.
        spacing={props.total > 12 ? 2 : 4}
        modifiers={[accessibilityHidden(true)]}
      >
        {Array.from({ length: props.total }, (_, index) => (
          <Capsule
            key={index}
            modifiers={[
              foregroundStyle(
                index < props.completed
                  ? palette.fill
                  : index < props.completed + props.failed
                    ? palette.warning
                    : palette.track,
              ),
              frame({ height: 6 }),
            ]}
          />
        ))}
      </HStack>
    );

    const retry = (palette: Palette) =>
      props.failed > 0 && (
        <HStack spacing={6}>
          <Image
            systemName="arrow.clockwise.circle"
            modifiers={[
              foregroundStyle(palette.warning),
              font({ textStyle: "footnote", weight: "semibold" }),
              accessibilityHidden(true),
            ]}
          />
          <Text
            modifiers={[
              foregroundStyle(palette.muted),
              font({ textStyle: "footnote" }),
              lineLimit(1),
            ]}
          >
            {`${props.failed} trenger et nytt forsøk`}
          </Text>
        </HStack>
      );

    const ring = (size: number) => (
      <ProgressView
        value={props.total > 0 ? props.completed / props.total : 0}
        modifiers={[
          progressViewStyle("circular"),
          tint(island.fill),
          frame({ width: size, height: size }),
          accessibilityLabel(summary),
        ]}
      />
    );

    return {
      banner: (
        <VStack
          alignment="leading"
          spacing={10}
          modifiers={[
            padding({ vertical: 16, horizontal: 18 }),
            activityBackgroundTint(hero),
            foregroundStyle(banner.ink),
            // A lock screen Live Activity is cut off above 160 points.
            dynamicTypeSize({ max: "xLarge" }),
          ]}
        >
          <HStack spacing={8}>
            {glyph(14, banner.ink)}
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
            modifiers={[
              accessibilityElement("combine"),
              accessibilityLabel(summary),
            ]}
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
          {retry(banner)}
        </VStack>
      ),
      bannerSmall: (
        <HStack
          spacing={8}
          modifiers={[
            padding({ all: 12 }),
            activityBackgroundTint(hero),
            foregroundStyle(banner.ink),
          ]}
        >
          {glyph(12, banner.ink)}
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
          {glyph(13, island.fill)}
        </ZStack>
      ),
      compactTrailing: ring(20),
      minimal: ring(22),
      expandedLeading: (
        <ZStack modifiers={[padding({ leading: 4, top: 4 })]}>
          <Circle
            modifiers={[
              foregroundStyle(hero),
              frame({ width: 40, height: 40 }),
            ]}
          />
          {glyph(16, banner.ink)}
        </ZStack>
      ),
      // The widget runtime applies a Text's modifiers twice, so padding sits on a
      // ZStack. The top paddings of leading, trailing, and center line up the title
      // and count with the 40-point disc, so they change together.
      expandedTrailing: (
        <ZStack modifiers={[padding({ trailing: 4, top: 10 })]}>
          <Text
            modifiers={[
              font({ textStyle: "title2", weight: "bold" }),
              foregroundStyle(island.ink),
              contentTransition("numericText"),
              lineLimit(1),
              minimumScaleFactor(0.7),
              accessibilityLabel(summary),
            ]}
          >
            {count}
          </Text>
        </ZStack>
      ),
      expandedCenter: (
        <ZStack modifiers={[padding({ top: 12 })]}>
          <Text
            modifiers={[
              font({ textStyle: "subheadline", weight: "semibold" }),
              foregroundStyle(island.ink),
              lineLimit(1),
            ]}
          >
            {title}
          </Text>
        </ZStack>
      ),
      expandedBottom: (
        <VStack
          alignment="leading"
          spacing={10}
          modifiers={[padding({ horizontal: 4, top: 6, bottom: 4 })]}
        >
          {segments(island)}
          {retry(island)}
        </VStack>
      ),
    };
  },
);
