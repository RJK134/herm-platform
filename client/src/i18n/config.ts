import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enLeaderboard from './locales/en/leaderboard.json';
import enCapabilities from './locales/en/capabilities.json';
import enSystems from './locales/en/systems.json';
import enProcurement from './locales/en/procurement.json';
import enVendor from './locales/en/vendor.json';
import enAdmin from './locales/en/admin.json';

import frCommon from './locales/fr/common.json';
import frLeaderboard from './locales/fr/leaderboard.json';
import frCapabilities from './locales/fr/capabilities.json';
import frSystems from './locales/fr/systems.json';
import frProcurement from './locales/fr/procurement.json';
import frVendor from './locales/fr/vendor.json';
import frAdmin from './locales/fr/admin.json';

import deCommon from './locales/de/common.json';
import deLeaderboard from './locales/de/leaderboard.json';
import deCapabilities from './locales/de/capabilities.json';
import deSystems from './locales/de/systems.json';
import deProcurement from './locales/de/procurement.json';
import deVendor from './locales/de/vendor.json';
import deAdmin from './locales/de/admin.json';

import esCommon from './locales/es/common.json';
import esLeaderboard from './locales/es/leaderboard.json';
import esCapabilities from './locales/es/capabilities.json';
import esSystems from './locales/es/systems.json';
import esProcurement from './locales/es/procurement.json';
import esVendor from './locales/es/vendor.json';
import esAdmin from './locales/es/admin.json';

import zhCommon from './locales/zh/common.json';
import zhLeaderboard from './locales/zh/leaderboard.json';
import zhCapabilities from './locales/zh/capabilities.json';
import zhSystems from './locales/zh/systems.json';
import zhProcurement from './locales/zh/procurement.json';
import zhVendor from './locales/zh/vendor.json';
import zhAdmin from './locales/zh/admin.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, leaderboard: enLeaderboard, capabilities: enCapabilities, systems: enSystems, procurement: enProcurement, vendor: enVendor, admin: enAdmin },
      fr: { common: frCommon, leaderboard: frLeaderboard, capabilities: frCapabilities, systems: frSystems, procurement: frProcurement, vendor: frVendor, admin: frAdmin },
      de: { common: deCommon, leaderboard: deLeaderboard, capabilities: deCapabilities, systems: deSystems, procurement: deProcurement, vendor: deVendor, admin: deAdmin },
      es: { common: esCommon, leaderboard: esLeaderboard, capabilities: esCapabilities, systems: esSystems, procurement: esProcurement, vendor: esVendor, admin: esAdmin },
      zh: { common: zhCommon, leaderboard: zhLeaderboard, capabilities: zhCapabilities, systems: zhSystems, procurement: zhProcurement, vendor: zhVendor, admin: zhAdmin },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'herm_language',
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
