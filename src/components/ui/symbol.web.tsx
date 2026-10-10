// The web build has no SF Symbols, so browser checks of the iOS app show each
// symbol as its closest Material Symbol, which expo-symbols draws on web.
// Weights run one step lighter than the SF weight because Material glyphs
// are heavier at the same nominal weight.
import {
  SymbolView as MaterialSymbol,
  type AndroidSymbol,
  type SFSymbol,
  type SymbolViewProps,
} from "expo-symbols";
import light from "expo-symbols/androidWeights/light";
import regular from "expo-symbols/androidWeights/regular";
import medium from "expo-symbols/androidWeights/medium";
import semiBold from "expo-symbols/androidWeights/semiBold";

const material = new Map<string, AndroidSymbol>([
  ["arrow.clockwise", "refresh"],
  ["arrow.clockwise.circle", "refresh"],
  ["arrow.down", "arrow_downward"],
  ["arrow.right", "arrow_forward"],
  ["arrow.up", "arrow_upward"],
  ["arrow.uturn.backward", "undo"],
  ["bag", "shopping_bag"],
  ["banknote", "payments"],
  ["barcode", "barcode"],
  ["bell", "notifications"],
  ["bell.slash", "notifications_off"],
  ["calendar", "calendar_today"],
  ["camera", "photo_camera"],
  ["camera.viewfinder", "center_focus_weak"],
  ["cart", "shopping_cart"],
  ["chart.bar", "bar_chart"],
  ["chart.bar.xaxis", "bar_chart"],
  ["checkmark", "check"],
  ["checkmark.circle", "check_circle"],
  ["checkmark.seal", "verified"],
  ["chevron.down", "expand_more"],
  ["chevron.left", "arrow_back_ios_new"],
  ["chevron.right", "arrow_forward_ios"],
  ["chevron.up", "expand_less"],
  ["circle.dotted", "pending"],
  ["coloncurrencysign.circle", "currency_exchange"],
  ["creditcard", "credit_card"],
  ["doc.badge.plus", "note_add"],
  ["doc.on.doc", "content_copy"],
  ["doc.questionmark", "unknown_document"],
  ["doc.text", "description"],
  ["doc.text.magnifyingglass", "document_search"],
  ["doc.viewfinder", "document_scanner"],
  ["ellipsis", "more_horiz"],
  ["equal.circle", "drag_handle"],
  ["exclamationmark.bubble", "feedback"],
  ["exclamationmark.circle", "error"],
  ["exclamationmark.triangle", "warning"],
  ["eye.slash", "visibility_off"],
  ["hourglass", "hourglass_empty"],
  ["info.circle", "info"],
  ["key", "key"],
  ["link", "link"],
  ["list.bullet", "list"],
  ["magnifyingglass", "search"],
  ["map", "map"],
  ["mappin.slash", "location_off"],
  ["numbers", "tag"],
  ["pencil", "edit"],
  ["person", "person"],
  ["person.2", "group"],
  ["photo", "image"],
  ["photo.on.rectangle", "photo_library"],
  ["plus", "add"],
  ["receipt", "receipt_long"],
  ["scalemass", "scale"],
  ["square.and.arrow.up", "ios_share"],
  ["storefront", "storefront"],
  ["tag", "sell"],
  ["textformat", "text_fields"],
  ["trash", "delete"],
  ["tray", "inbox"],
  ["tray.full", "inbox"],
  ["wifi.slash", "wifi_off"],
  ["xmark", "close"],
]);

const weights = new Map<SymbolViewProps["weight"], typeof light>([
  ["medium", regular],
  ["semibold", medium],
  ["bold", semiBold],
]);

const reported = new Set<string>();

/** The matching Material Symbol; a `.fill` variant uses the outline glyph. */
function materialName(symbol: SFSymbol) {
  const match = material.get(symbol.replace(/\.fill$/, ""));

  if (match) return match;

  if (!reported.has(symbol)) {
    reported.add(symbol);
    console.error(
      `No web icon for SF Symbol "${symbol}". Add one to src/components/ui/symbol.web.tsx.`,
    );
  }

  return "help";
}

export function SymbolView({ name, weight, ...props }: SymbolViewProps) {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- SymbolViewProps allows a per-platform name object; Icon passes SF names.
  const symbol = typeof name === "string" ? name : name.ios;

  return (
    <MaterialSymbol
      {...props}
      name={{ web: symbol ? materialName(symbol) : "help" }}
      weight={{ ios: "regular", android: weights.get(weight) ?? light }}
    />
  );
}
