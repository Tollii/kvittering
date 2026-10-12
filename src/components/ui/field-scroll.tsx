import {
  createContext,
  useContext,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ScrollView, type TextInput } from "react-native";

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
 * A scroll view that keeps the focused `Field` in sight. The keyboard avoiding
 * view around it shrinks it when the keyboard opens, but a scroll view does
 * not follow the focused input by itself, so a field near the bottom would
 * stay behind the keyboard and its "Ferdig" bar. Only this scroll view moves,
 * so screens behind a sheet and other mounted screens keep their place.
 */
export function FieldScrollView({
  onScroll,
  onLayout,
  ...props
}: Readonly<ComponentProps<typeof ScrollView>>) {
  const scroll = useRef<ScrollView>(null);
  const focused = useRef<TextInput | null>(null);
  const viewport = useRef({ offset: 0, height: 0 });

  const reveal = () => {
    const input = focused.current;
    const frame = scroll.current?.getNativeScrollRef();

    if (!input || !frame) return;

    frame.measureInWindow((_left, frameTop, _width, frameHeight) =>
      input.measureInWindow((_x, top, _w, height) => {
        const overflow =
          top + height + keyboardMargin - (frameTop + frameHeight);

        if (overflow > 0)
          scroll.current?.scrollTo({ y: viewport.current.offset + overflow });
      }),
    );
  };

  const field: FocusedField = {
    focus: (input) => {
      focused.current = input;
      reveal();
    },
    blur: (input) => {
      if (focused.current === input) focused.current = null;
    },
  };

  return (
    <FocusedFieldContext.Provider value={field}>
      <ScrollView
        ref={scroll}
        scrollEventThrottle={16}
        {...props}
        onScroll={(event) => {
          viewport.current.offset = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          const shrank = height < viewport.current.height;
          viewport.current.height = height;

          // The keyboard opening shrinks the view after the field took focus.
          if (shrank) reveal();
          onLayout?.(event);
        }}
      />
    </FocusedFieldContext.Provider>
  );
}
