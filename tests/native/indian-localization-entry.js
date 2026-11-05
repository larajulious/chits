// QA-only entry. Production continues to use expo-router/entry.
import { registerRootComponent } from 'expo';
import IndianLocalizationQA from './indian-localization.fixture';
registerRootComponent(IndianLocalizationQA);
