// Memory-safe thumbnail for grids/lists: always the small derivative, downscaled to the view,
// disk+memory cached and recycled by key so virtualized lists reuse decoders instead of piling up bitmaps.
import { Image, ImageProps } from "expo-image";
import { colors } from "@/src/theme";
import { fileUrl } from "@/src/api";

type Props = {
  uri?: string | null;
  recyclingKey?: string;
  style?: ImageProps["style"];
  contentFit?: ImageProps["contentFit"];
  transition?: number;
  testID?: string;
};

export function Thumb({ uri, recyclingKey, style, contentFit = "cover", transition = 80, testID }: Props) {
  return (
    <Image
      testID={testID}
      source={fileUrl(uri) ? { uri: fileUrl(uri) } : undefined}
      recyclingKey={recyclingKey}
      cachePolicy="memory-disk"
      allowDownscaling
      contentFit={contentFit}
      transition={transition}
      style={[{ backgroundColor: colors.surfaceTertiary }, style]}
    />
  );
}

/** Pick the smallest derivative that still looks sharp at `sizePt` (device points). */
export function pickPhotoUri(photo: { thumbnail_url?: string; preview_url?: string; original_url?: string } | undefined, sizePt: number) {
  if (!photo) return undefined;
  if (sizePt <= 130) return photo.thumbnail_url || photo.preview_url;
  return photo.preview_url || photo.thumbnail_url;
}
