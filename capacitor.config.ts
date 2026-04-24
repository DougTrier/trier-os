// Copyright © 2026 Trier OS. All Rights Reserved.
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.trieros.app',
    appName: 'Trier OS',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        PushNotifications: {
            presentationOptions: ['badge', 'sound', 'alert']
        },
        Camera: {
            resultType: 'base64'
        },
        SplashScreen: {
            launchShowDuration: 1500,
            backgroundColor: '#0f172a',
            showSpinner: false
        }
    },
    ios: {
        contentInset: 'always',
        limitsNavigationsToAppBoundDomains: true
    },
    android: {
        allowMixedContent: false,
        captureInput: true
    }
};

export default config;
