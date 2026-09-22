# Monument illustrations

These illustrations were generated for the approved Kvitto design prototype.
The native application uses the same source images as the HTML prototype:

- `inbox-nave.png`: stone hall for the empty inbox and compact spending summary.
- `history-monument.png`: monumental paper roll for empty history.

Keep the illustrations separate from text, charts, and product photographs.
Product photographs retain their original colours for recognition.

## App icon

`app-icon.svg` is the source for the native app icon. It uses the white double
arch from `ArchMark` on the light theme's cobalt background (`#263CC7`). Keep
the shape and colour aligned with the welcome screen.

The PNG exports in `assets/images` serve separate native surfaces:

- `icon.png`: opaque 1024 × 1024 square; the operating system applies its mask.
- `splash-icon.png`: the same icon with rounded corners and a transparent edge.
- `android-icon-foreground.png`: white arch on a transparent 1024 × 1024 layer.
- `android-icon-background.png`: opaque cobalt background.
- `android-icon-monochrome.png`: arch alpha mask for Android themed icons.

The native icon and splash arch occupy the central 49% of the width and 57%
of the height. Android layers reduce the arch to 38% by 45% to keep it within
the adaptive icon safe area. Icon and splash changes require a new native build.
