// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Expo's React Compiler rules currently flag established React Native patterns:
    // async state hydration in effects, imperative refs used by gesture handlers,
    // and Reanimated shared-value mutations inside worklets. Keep these exceptions
    // scoped to the affected screens/components; all other Expo lint rules remain active.
    files: [
      'app/(tabs)/chat.tsx',
      'app/(tabs)/home.tsx',
      'app/(tabs)/profile.tsx',
      'app/admin/designs.tsx',
      'app/admin/settings.tsx',
      'app/album/[id]/checkout.tsx',
      'app/album/[id]/page.tsx',
      'app/album/[id]/preview.tsx',
      'app/create/upload.tsx',
      'app/print-studio.tsx',
      'src/components/auto-slider.tsx',
      'src/components/book-preview.tsx',
      'src/components/razorpay-checkout.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]);
