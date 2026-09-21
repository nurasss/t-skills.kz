/** Next-only загрузчик шрифтов для teen-PDF (`?inline` недоступен под tsx). */
import robotoData from "@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf?inline";
import robotoBoldData from "@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf?inline";
import loraData from "@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf?inline";

import type { TeenPdfFontData } from "@/lib/teen-pdf";

export function teenPdfFonts(): TeenPdfFontData {
  return { sans: robotoData, sansBold: robotoBoldData, serif: loraData };
}
