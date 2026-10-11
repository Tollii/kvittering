import { useState } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  ReduceMotion,
  createAnimatedComponent,
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import { motion } from "@/constants/theme";
import { Chevron } from "./typography";

const AnimatedPressable = createAnimatedComponent(Pressable);

/** Strong ease-out for anything that arrives or answers a press. */
export const easeOut = cubicBezier(...motion.easeOut);

/** Strong ease-in-out for something that turns or moves in place. */
export const easeInOut = cubicBezier(...motion.easeInOut);

/**
 * The one pressable surface. `scale` is for things that read as objects, such
 * as buttons, chips, and cards: they shrink a little under the finger.
 * `highlight` is for rows and text inside a card, which only dim, because a
 * row shrinking inside its card looks broken. Reduce Motion keeps the dimming
 * and drops the shrink.
 */
export function Press({
  feedback = "scale",
  style,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style"> & {
  feedback?: "scale" | "highlight";
  style?: StyleProp<ViewStyle>;
}) {
  const [down, setDown] = useState(false);
  const reduced = useReducedMotion();
  const shrink = feedback === "scale" && !reduced;

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        setDown(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setDown(false);
        onPressOut?.(event);
      }}
      style={[
        {
          opacity: down
            ? shrink
              ? motion.pressOpacity
              : motion.highlightOpacity
            : 1,
          transform: [{ scale: down && shrink ? motion.pressScale : 1 }],
          transitionProperty: ["opacity", "transform"],
          transitionDuration: motion.press,
          transitionTimingFunction: easeOut,
        },
        // Last, so a disabled control's `faded()` opacity wins.
        style,
      ]}
    />
  );
}

/**
 * The chevron of something that expands in place. It turns rather than
 * swapping symbols, so the change reads as one control changing state.
 */
export function ExpandChevron({ open }: Readonly<{ open: boolean }>) {
  return (
    <Animated.View
      style={{
        transform: [{ rotate: open ? "180deg" : "0deg" }],
        transitionProperty: "transform",
        transitionDuration: motion.state,
        transitionTimingFunction: easeInOut,
      }}
    >
      <Chevron direction="down" />
    </Animated.View>
  );
}

/**
 * How content a person asked for arrives in place, such as a disclosure's
 * detail or Kamera's upload note: it settles a few points down from where it
 * came from. Reduce Motion keeps only the fade.
 */
export function useArrival() {
  const reduced = useReducedMotion();
  const easing = Easing.bezier(...motion.easeOut);

  // Reanimated skips layout animations under Reduce Motion unless told not to.
  if (reduced)
    return FadeIn.duration(motion.state)
      .easing(easing)
      .reduceMotion(ReduceMotion.Never);

  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: -6 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing },
  }).duration(motion.state);
}

/**
 * How content leaves on its own: back the way it came, faster than it
 * arrived, because the person is not waiting on it. `left` continues a swipe
 * to the left, as an approved receipt does.
 */
export function useDeparture(toward: "up" | "left" = "up") {
  const reduced = useReducedMotion();
  const easing = Easing.bezier(...motion.easeOut);

  if (reduced)
    return FadeOut.duration(motion.press)
      .easing(easing)
      .reduceMotion(ReduceMotion.Never);

  const exit = {
    up: { x: 0, y: -6 },
    left: { x: -motion.swipeExit, y: 0 },
  }[toward];

  // Every keyframe must name the same transforms, in the same order.
  return new Keyframe({
    0: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] },
    100: {
      opacity: 0,
      transform: [{ translateX: exit.x }, { translateY: exit.y }],
      easing,
    },
  }).duration(motion.press);
}
