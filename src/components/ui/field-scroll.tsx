import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Keyboard, ScrollView, type TextInput } from "react-native";

/** Room kept between a focused field and the keyboard's "Ferdig" bar. */
const keyboardMargin = 16;

type FocusedField = Readonly<{
  focus: (input: TextInput) => void;
  blur: (input: TextInput) => void;
}>;

const FocusedFieldContext = createContext<FocusedField | null>(null);

/** Lets a field tell the scroll view around it that it has focus. */
export function useFocusedField(): FocusedField | null {
  return useContext(FocusedFieldContext);
}

/**
 * Stops a field in a sheet from reaching the scroll view of the screen behind
 * it, since React context passes into the sheet.
 */
export function FieldScrollBoundary({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <FocusedFieldContext.Provider value={null}>
      {children}
    </FocusedFieldContext.Provider>
  );
}

/**
 * A scroll view that keeps the focused `Field` in sight. A scroll view does
 * not follow the focused input by itself, so a field near the bottom stayed
 * behind the keyboard and its "Ferdig" bar. While one of its own fields has
 * focus, this scroll view makes room under its content for the part of the
 * keyboard that covers it and scrolls the field above the keyboard. Only this
 * scroll view moves, so screens behind a sheet and other mounted screens keep
 * their place.
 */
export function FieldScrollView({
  onScroll,
  contentInset,
  ...props
}: Readonly<ComponentProps<typeof ScrollView>>) {
  const scroll = useRef<ScrollView>(null);
  const focused = useRef<TextInput | null>(null);
  const offset = useRef(0);
  // Each reveal, blur and hidden keyboard starts a new generation, so a
  // measurement that returns late cannot apply an older keyboard frame.
  const generation = useRef(0);
  const [covered, setCovered] = useState(0);

  // keyboardTop is the keyboard's top edge in the window.
  const reveal = (keyboardTop: number) => {
    const input = focused.current;
    const frame = scroll.current?.getNativeScrollRef();

    generation.current += 1;
    const current = generation.current;

    const stale = () =>
      generation.current !== current || focused.current !== input;

    if (!input || !frame) return;

    frame.measureInWindow((_left, frameTop, _width, frameHeight) => {
      if (stale()) return;

      const visibleBottom = Math.min(frameTop + frameHeight, keyboardTop);
      setCovered(Math.max(0, frameTop + frameHeight - keyboardTop));

      input.measureInWindow((_x, top, _w, height) => {
        if (stale()) return;

        const overflow = top + height + keyboardMargin - visibleBottom;

        if (overflow > 0)
          scroll.current?.scrollTo({ y: offset.current + overflow });
      });
    });
  };

  useEffect(() => {
    // Fires when the keyboard shows, hides, or changes height, such as
    // switching from the number pad to letters while the field keeps focus.
    const changed = Keyboard.addListener("keyboardDidChangeFrame", (event) =>
      reveal(event.endCoordinates.screenY),
    );

    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      generation.current += 1;
      setCovered(0);
    });

    return () => {
      changed.remove();
      hidden.remove();
    };
  });

  const field: FocusedField = {
    focus: (input) => {
      focused.current = input;
      const keyboard = Keyboard.metrics();

      // Moving to another field leaves the keyboard up without a new event.
      if (Keyboard.isVisible() && keyboard) reveal(keyboard.screenY);
    },
    blur: (input) => {
      if (focused.current !== input) return;

      focused.current = null;
      generation.current += 1;
    },
  };

  return (
    <FocusedFieldContext.Provider value={field}>
      <ScrollView
        ref={scroll}
        scrollEventThrottle={16}
        // The room under the content arrives with the next render, after the scroll.
        scrollToOverflowEnabled
        {...props}
        contentInset={{
          ...contentInset,
          bottom: (contentInset?.bottom ?? 0) + covered,
        }}
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
      />
    </FocusedFieldContext.Provider>
  );
}
