/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';

// Global quota detection at module root
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

window.addEventListener('gmp-quota-exceeded', () => {
  const banner = document.getElementById('quota-banner');
  if (banner) {
    banner.classList.remove('hidden');
    document.body.classList.add('has-quota-banner');
  }
});

const closeQuotaBtn = document.getElementById('close-quota-banner');
if (closeQuotaBtn) {
  closeQuotaBtn.addEventListener('click', () => {
    const banner = document.getElementById('quota-banner');
    if (banner) {
      banner.classList.add('hidden');
      document.body.classList.remove('has-quota-banner');
    }
  });
}

const GOOGLE_MAPS_API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

interface GroundingSource {
  title: string;
  uri: string;
  type: 'maps' | 'search';
}

let map: google.maps.Map | null = null;
let currentMarker: google.maps.marker.AdvancedMarkerElement | null = null;
let markerLibrary: google.maps.MarkerLibrary | null = null;
let infoWindow: google.maps.InfoWindow | null = null;
let streetViewService: google.maps.StreetViewService | null = null;
let panorama: google.maps.StreetViewPanorama | null = null;
let geocoder: any = null;
let lastTargetLocation: google.maps.LatLngLiteral = { lat: 25, lng: 15 };
let lastLocationInfo: {
  title: string;
  details: string;
  sources?: GroundingSource[];
} | null = null;

let currentSelectedCountry: string = 'WORLDWIDE';

interface CountryInfo {
  name: string;
  flag: string;
  lat: number;
  lng: number;
  zoom: number;
}

const COUNTRIES_MAP: Record<string, CountryInfo> = {
  WORLDWIDE: { name: 'Worldwide', flag: '🌍', lat: 25, lng: 15, zoom: 3 },
  India: { name: 'India', flag: '🇮🇳', lat: 20.5937, lng: 78.9629, zoom: 5 },
  'United States': { name: 'United States', flag: '🇺🇸', lat: 37.0902, lng: -95.7129, zoom: 4 },
  Japan: { name: 'Japan', flag: '🇯🇵', lat: 36.2048, lng: 138.2529, zoom: 5 },
  Italy: { name: 'Italy', flag: '🇮🇹', lat: 41.8719, lng: 12.5674, zoom: 6 },
  Iceland: { name: 'Iceland', flag: '🇮🇸', lat: 64.9631, lng: -19.0208, zoom: 6 },
  Brazil: { name: 'Brazil', flag: '🇧🇷', lat: -14.235, lng: -51.9253, zoom: 4 },
  Australia: { name: 'Australia', flag: '🇦🇺', lat: -25.2744, lng: 133.7751, zoom: 4 },
  France: { name: 'France', flag: '🇫🇷', lat: 46.2276, lng: 2.2137, zoom: 6 },
  Spain: { name: 'Spain', flag: '🇪🇸', lat: 40.4637, lng: -3.7492, zoom: 6 },
  Germany: { name: 'Germany', flag: '🇩🇪', lat: 51.1657, lng: 10.4515, zoom: 6 },
  'United Kingdom': { name: 'United Kingdom', flag: '🇬🇧', lat: 55.3781, lng: -3.436, zoom: 5 },
  Canada: { name: 'Canada', flag: '🇨🇦', lat: 56.1304, lng: -106.3468, zoom: 4 },
  Argentina: { name: 'Argentina', flag: '🇦🇷', lat: -38.4161, lng: -63.6167, zoom: 4 },
  Austria: { name: 'Austria', flag: '🇦🇹', lat: 47.5162, lng: 14.5501, zoom: 7 },
  Chile: { name: 'Chile', flag: '🇨🇱', lat: -35.6751, lng: -71.543, zoom: 4 },
  China: { name: 'China', flag: '🇨🇳', lat: 35.8617, lng: 104.1954, zoom: 4 },
  Colombia: { name: 'Colombia', flag: '🇨🇴', lat: 4.5709, lng: -74.2973, zoom: 5 },
  'Costa Rica': { name: 'Costa Rica', flag: '🇨🇷', lat: 9.7489, lng: -83.7534, zoom: 8 },
  Croatia: { name: 'Croatia', flag: '🇭🇷', lat: 45.1, lng: 15.2, zoom: 7 },
  Egypt: { name: 'Egypt', flag: '🇪🇬', lat: 26.8206, lng: 30.8025, zoom: 6 },
  Greece: { name: 'Greece', flag: '🇬🇷', lat: 39.0742, lng: 21.8243, zoom: 6 },
  Indonesia: { name: 'Indonesia', flag: '🇮🇩', lat: -0.7893, lng: 113.9213, zoom: 5 },
  Ireland: { name: 'Ireland', flag: '🇮🇪', lat: 53.1424, lng: -7.6921, zoom: 7 },
  Kenya: { name: 'Kenya', flag: '🇰🇪', lat: -0.0236, lng: 37.9062, zoom: 6 },
  Malaysia: { name: 'Malaysia', flag: '🇲🇾', lat: 4.2105, lng: 101.9758, zoom: 6 },
  Mexico: { name: 'Mexico', flag: '🇲🇽', lat: 23.6345, lng: -102.5528, zoom: 5 },
  Morocco: { name: 'Morocco', flag: '🇲🇦', lat: 31.7917, lng: -7.0926, zoom: 6 },
  Nepal: { name: 'Nepal', flag: '🇳🇵', lat: 28.3949, lng: 84.124, zoom: 7 },
  Netherlands: { name: 'Netherlands', flag: '🇳🇱', lat: 52.1326, lng: 5.2913, zoom: 7 },
  'New Zealand': { name: 'New Zealand', flag: '🇳🇿', lat: -40.9006, lng: 174.886, zoom: 5 },
  Norway: { name: 'Norway', flag: '🇳🇴', lat: 60.472, lng: 8.4689, zoom: 5 },
  Peru: { name: 'Peru', flag: '🇵🇪', lat: -9.19, lng: -75.0152, zoom: 5 },
  Philippines: { name: 'Philippines', flag: '🇵🇭', lat: 12.8797, lng: 121.774, zoom: 6 },
  Portugal: { name: 'Portugal', flag: '🇵🇹', lat: 39.3999, lng: -8.2245, zoom: 7 },
  'Saudi Arabia': { name: 'Saudi Arabia', flag: '🇸🇦', lat: 23.8859, lng: 45.0792, zoom: 5 },
  'South Africa': { name: 'South Africa', flag: '🇿🇦', lat: -30.5595, lng: 22.9375, zoom: 5 },
  'South Korea': { name: 'South Korea', flag: '🇰🇷', lat: 35.9078, lng: 127.7669, zoom: 7 },
  Sweden: { name: 'Sweden', flag: '🇸🇪', lat: 60.1282, lng: 18.6435, zoom: 5 },
  Switzerland: { name: 'Switzerland', flag: '🇨🇭', lat: 46.8182, lng: 8.2275, zoom: 7 },
  Thailand: { name: 'Thailand', flag: '🇹🇭', lat: 15.87, lng: 100.9925, zoom: 6 },
  Turkey: { name: 'Turkey', flag: '🇹🇷', lat: 38.9637, lng: 35.2433, zoom: 6 },
  'United Arab Emirates': { name: 'United Arab Emirates', flag: '🇦🇪', lat: 23.4241, lng: 53.8478, zoom: 7 },
  Vietnam: { name: 'Vietnam', flag: '🇻🇳', lat: 14.0583, lng: 108.2772, zoom: 5 },
};

interface CuratedPlace {
  location: string;
  lat: number;
  lng: number;
  zoom: number;
  caption: string;
}

const CURATED_DESTINATIONS_INDIA: Record<string, CuratedPlace> = {
  cold: {
    location: 'Dras Valley, Ladakh, India',
    lat: 34.4294,
    lng: 75.7589,
    zoom: 10,
    caption: 'Known as the "Gateway to Ladakh", Dras is one of the coldest inhabited places on Earth with winter temperatures plunging below -40°C.',
  },
  ancient: {
    location: 'Hampi UNESCO World Heritage Site, Karnataka, India',
    lat: 15.335,
    lng: 76.46,
    zoom: 12,
    caption: 'The enigmatic 14th-century capital of the Vijayanagara Empire, studded with monolithic boulders, stepped tanks, and magnificent granite temples.',
  },
  metropolitan: {
    location: 'Marine Drive & South Mumbai, Maharashtra, India',
    lat: 18.9438,
    lng: 72.8231,
    zoom: 12,
    caption: 'India’s bustling financial powerhouse and city of dreams, sweeping along the Arabian Sea with world-renowned Victorian and Art Deco architecture.',
  },
  rainforest: {
    location: 'Silent Valley National Park, Kerala, India',
    lat: 11.0843,
    lng: 76.4278,
    zoom: 11,
    caption: 'A legendary virgin tropical evergreen rainforest in the Nilgiri Hills of the Western Ghats, sanctuary to endangered lion-tailed macaques.',
  },
  remote: {
    location: 'Changthang Plateau & Tso Moriri, Ladakh, India',
    lat: 32.8988,
    lng: 78.3032,
    zoom: 9,
    caption: 'A high-altitude windswept wilderness at 4,500m home to Changpa nomadic pastoralists, rare black-necked cranes, and wild kiangs.',
  },
  surreal: {
    location: 'Lonar Meteorite Impact Lake, Maharashtra, India',
    lat: 19.976,
    lng: 76.507,
    zoom: 13,
    caption: 'A geo-heritage wonder formed by a hypervelocity meteorite impact 52,000 years ago, creating an otherworldly saline-alkaline crater lake.',
  },
  volcano: {
    location: 'Barren Island Active Volcano, Andaman Islands, India',
    lat: 12.2783,
    lng: 93.8583,
    zoom: 12,
    caption: 'The only confirmed active volcano in South Asia, rising dramatically from the depths of the Andaman Sea with active basalt lava fields.',
  },
  islands: {
    location: 'Radhanagar Beach, Havelock Island (Swaraj Dweep), India',
    lat: 11.9839,
    lng: 92.951,
    zoom: 12,
    caption: 'Regarded as one of Asia’s most pristine shores, featuring turquoise coral waters, white sands, and tropical rainforest fringes.',
  },
  coasts: {
    location: 'Dhanushkodi & Rama Setu, Tamil Nadu, India',
    lat: 9.1768,
    lng: 79.4181,
    zoom: 12,
    caption: 'The ghost town at the southern tip of Pamban Island where the calm waters of the Bay of Bengal meet the roaring Indian Ocean.',
  },
  desert: {
    location: 'Great Rann of Kutch White Salt Desert, Gujarat, India',
    lat: 23.8344,
    lng: 69.8379,
    zoom: 9,
    caption: 'One of the world’s largest salt deserts, glistening like an infinite white moonscape across western Gujarat.',
  },
  castles: {
    location: 'Mehrangarh Fort, Jodhpur, Rajasthan, India',
    lat: 26.298,
    lng: 73.0189,
    zoom: 14,
    caption: 'A colossal 15th-century cliffside fortress towering 400 feet above the Blue City of Jodhpur with impenetrable stone ramparts.',
  },
  aurora: {
    location: 'Hanle Dark Sky Reserve, Ladakh, India',
    lat: 32.7794,
    lng: 78.9642,
    zoom: 10,
    caption: 'One of the world’s highest dark-sky preserves at 4,500m elevation, offering crystal-clear celestial night sky vistas and rare auroral events.',
  },
  caves: {
    location: 'Belum Caves, Andhra Pradesh, India',
    lat: 15.1026,
    lng: 78.1119,
    zoom: 13,
    caption: 'The second largest cave network in the Indian subcontinent, featuring 3.2km of underground passages, stalactites, and cavern chambers.',
  },
  blooms: {
    location: 'Valley of Flowers National Park, Uttarakhand, India',
    lat: 30.728,
    lng: 79.6053,
    zoom: 11,
    caption: 'A UNESCO World Heritage valley in the Western Himalayas that bursts each monsoon into a vibrant carpet of endemic alpine wildflowers.',
  },
  sanctuaries: {
    location: 'Tungnath Shiva Temple, Garhwal Himalayas, India',
    lat: 30.4889,
    lng: 79.2167,
    zoom: 13,
    caption: 'The highest Shiva temple in the world situated at an altitude of 3,680 meters (12,073 ft), enveloped by snow-clad Himalayan peaks.',
  },
  passes: {
    location: 'Khardung La High-Altitude Mountain Pass, Ladakh, India',
    lat: 34.2787,
    lng: 77.6047,
    zoom: 11,
    caption: 'A legendary high-altitude pass at 5,359 meters (17,582 ft), carving a dramatic roadway between Leh and the Nubra Valley.',
  },
};

const CURATED_DESTINATIONS_WORLDWIDE: Record<string, CuratedPlace> = {
  cold: {
    location: 'Oymyakon, Sakha Republic, Siberia',
    lat: 63.4641,
    lng: 142.7737,
    zoom: 8,
    caption: 'Known as the Pole of Cold, this is the coldest permanently inhabited settlement on Earth, having recorded a bone-chilling -67.7°C (-89.9°F).',
  },
  ancient: {
    location: 'Göbekli Tepe, Şanlıurfa, Turkey',
    lat: 37.2231,
    lng: 38.9225,
    zoom: 12,
    caption: 'Dating back 11,500 years to the pre-pottery Neolithic era, this monument features massive T-shaped megaliths carved with wild predators.',
  },
  metropolitan: {
    location: 'Shinjuku & Shibuya, Tokyo, Japan',
    lat: 35.6938,
    lng: 139.7036,
    zoom: 13,
    caption: 'The beating neon heart of Tokyo, boasting the world’s busiest pedestrian crossing, towering futuristic skyscrapers, and culinary nightlife.',
  },
  rainforest: {
    location: 'Yasuní Biosphere Reserve, Amazon Rainforest, Ecuador',
    lat: -0.9997,
    lng: -76.3637,
    zoom: 9,
    caption: 'Arguably the most biologically diverse pocket of wilderness on Earth, where a single hectare contains more tree species than all of North America.',
  },
  remote: {
    location: 'Tristan da Cunha, South Atlantic Ocean',
    lat: -37.1052,
    lng: -12.2777,
    zoom: 9,
    caption: 'The most isolated inhabited archipelago on the planet, over 2,400 km from the nearest landmass in the deep South Atlantic.',
  },
  surreal: {
    location: 'Salar de Uyuni White Salt Flats, Bolivia',
    lat: -20.1338,
    lng: -67.4891,
    zoom: 8,
    caption: 'The world’s largest salt flat spanning over 10,000 square kilometers, transforming into a celestial, mirror-like reflection of the sky.',
  },
  volcano: {
    location: 'Mount Yasur Active Volcano, Tanna Island, Vanuatu',
    lat: -19.532,
    lng: 169.447,
    zoom: 12,
    caption: 'One of the world’s most accessible continuously erupting volcanoes, producing dramatic strombolian fireworks almost non-stop for centuries.',
  },
  islands: {
    location: 'Aitutaki Lagoon & Atoll, Cook Islands',
    lat: -18.8579,
    lng: -159.7853,
    zoom: 11,
    caption: 'A breathtaking Polynesian atoll encircled by a turquoise lagoon, powder sandbars, and untouched coral ecosystems.',
  },
  coasts: {
    location: 'Nā Pali Coast State Wilderness Park, Kauai, Hawaii',
    lat: 22.1852,
    lng: -159.6486,
    zoom: 11,
    caption: 'Towering 4,000-foot razor-sharp emerald sea cliffs dropping vertically into the cobalt Pacific Ocean.',
  },
  desert: {
    location: 'Deadvlei & Sossusvlei Dunes, Namib Desert, Namibia',
    lat: -24.7594,
    lng: 15.2925,
    zoom: 11,
    caption: 'A surreal white clay pan home to 900-year-old scorched camelthorn skeletons, framed by rust-red sand dunes.',
  },
  castles: {
    location: 'Predjama Castle, Postojna, Slovenia',
    lat: 45.8158,
    lng: 14.1268,
    zoom: 13,
    caption: 'A dramatic Renaissance fortress perched halfway up a 123-meter vertical cliff face, built directly into the mouth of an underground cave.',
  },
  aurora: {
    location: 'Tromsø & Senja, Arctic Norway',
    lat: 69.6492,
    lng: 18.9553,
    zoom: 10,
    caption: 'A prime northern gateway situated under the auroral oval, offering world-class views of the aurora borealis dancing over Arctic fjords.',
  },
  caves: {
    location: 'Hang Sơn Đoòng, Phong Nha-Kẻ Bàng, Vietnam',
    lat: 17.4569,
    lng: 106.2875,
    zoom: 12,
    caption: 'The world’s largest natural cave passage, so gargantuan it possesses its own localized microclimate, subterranean clouds, and underground jungle.',
  },
  blooms: {
    location: 'Namaqualand Wildflower Splendor, Northern Cape, South Africa',
    lat: -29.689,
    lng: 17.8867,
    zoom: 9,
    caption: 'An arid semi-desert that explodes into a kaleidoscopic floral tapestry of millions of wild daisies every spring.',
  },
  sanctuaries: {
    location: 'Meteora Monasteries, Thessaly, Greece',
    lat: 39.7217,
    lng: 21.6306,
    zoom: 13,
    caption: 'Six functioning Eastern Orthodox monasteries precariously perched atop dramatic sandstone rock pillars rising hundreds of meters into the sky.',
  },
  passes: {
    location: 'Stelvio Pass (Passo dello Stelvio), Italian Alps',
    lat: 46.5286,
    lng: 10.4531,
    zoom: 12,
    caption: 'At 2,757 meters elevation, this legendary alpine pass features 48 numbered hairpin switchbacks winding down sheer mountain walls.',
  },
};

function getCuratedDestination(country: string, presetId: string): CuratedPlace {
  if (country === 'India' && CURATED_DESTINATIONS_INDIA[presetId]) {
    return CURATED_DESTINATIONS_INDIA[presetId];
  }
  if (CURATED_DESTINATIONS_WORLDWIDE[presetId]) {
    return CURATED_DESTINATIONS_WORLDWIDE[presetId];
  }
  // Generic country fallback
  const cInfo = COUNTRIES_MAP[country] || COUNTRIES_MAP['WORLDWIDE'];
  return {
    location: `${cInfo.name}`,
    lat: cInfo.lat,
    lng: cInfo.lng,
    zoom: cInfo.zoom,
    caption: `Exploring extraordinary destinations and landscapes across ${cInfo.name}.`,
  };
}

export interface PlaceResultItem {
  id: string;
  location: string;
  latitude: number;
  longitude: number;
  zoom: number;
  caption: string;
  eraOrPeriod?: string;
  country?: string;
}

export interface MultiResultsPayload {
  theme: string;
  icon?: string;
  subtitle?: string;
  places: PlaceResultItem[];
}

const CURATED_MULTI_ANCIENT: Record<string, PlaceResultItem[]> = {
  WORLDWIDE: [
    {
      id: 'ww-1',
      location: 'Göbekli Tepe, Şanlıurfa, Turkey',
      latitude: 37.2231,
      longitude: 38.9225,
      zoom: 13,
      eraOrPeriod: 'Neolithic (~9500 BCE)',
      caption:
        'The oldest known monumental temple complex on Earth, featuring massive 20-ton T-shaped limestone megaliths carved with wild beasts, predating agriculture and pottery.',
    },
    {
      id: 'ww-2',
      location: 'Moai of Rapa Nui (Easter Island), Chile',
      latitude: -27.1212,
      longitude: -109.3667,
      zoom: 12,
      eraOrPeriod: 'Polynesian (1250–1500 CE)',
      caption:
        'Nearly 1,000 colossal monolithic volcanic stone figures sculpted by ancient Polynesian voyagers, staring inward across the world’s most isolated inhabited island.',
    },
    {
      id: 'ww-3',
      location: 'Great Pyramids & Sphinx of Giza, Egypt',
      latitude: 29.9792,
      longitude: 31.1342,
      zoom: 13,
      eraOrPeriod: 'Old Kingdom (~2560 BCE)',
      caption:
        'The only surviving wonder of the ancient world, aligned to true north with mind-boggling architectural and mathematical precision from 4,500 years ago.',
    },
    {
      id: 'ww-4',
      location: 'Petra Nabataean Rose City, Jordan',
      latitude: 30.3285,
      longitude: 35.4444,
      zoom: 13,
      eraOrPeriod: 'Nabataean (~300 BCE)',
      caption:
        'A legendary desert metropolis half-carved directly into vibrant rose-red sandstone canyon cliffs, hidden at the end of a dramatic winding gorge.',
    },
    {
      id: 'ww-5',
      location: 'Nazca Lines & Geoglyphs, Ica Region, Peru',
      latitude: -14.739,
      longitude: -75.13,
      zoom: 11,
      eraOrPeriod: 'Nazca (~500 BCE–500 CE)',
      caption:
        'Hundreds of enigmatic geometric figures, hummingbirds, spiders, and spirals etched into 500 square kilometers of desert plateaus, visible in full only from above.',
    },
    {
      id: 'ww-6',
      location: 'Stonehenge Megaliths, Wiltshire, United Kingdom',
      latitude: 51.1789,
      longitude: -1.8262,
      zoom: 14,
      eraOrPeriod: 'Neolithic (~3000–2000 BCE)',
      caption:
        'An iconic circle of 25-ton sarsen standing stones transported hundreds of kilometers across prehistoric Britain, precisely aligned with the summer and winter solstices.',
    },
  ],
  India: [
    {
      id: 'in-1',
      location: 'Hampi Vijayanagara UNESCO Ruins, Karnataka, India',
      latitude: 15.335,
      longitude: 76.46,
      zoom: 12,
      eraOrPeriod: '14th–16th Century CE',
      caption:
        'The monumental capital of the Vijayanagara Empire, studded with musical stone pillars, royal stepped bathing tanks, and monolithic boulder-strewn terrain.',
    },
    {
      id: 'in-2',
      location: 'Kailasa Monolithic Temple (Cave 16, Ellora), Maharashtra, India',
      latitude: 20.0238,
      longitude: 75.1793,
      zoom: 14,
      eraOrPeriod: 'Rashtrakuta (8th Century CE)',
      caption:
        'The largest single monolithic rock excavation in the world, carved vertically top-down out of a basalt cliff face with over 200,000 tons of solid stone removed.',
    },
    {
      id: 'in-3',
      location: 'Dholavira Harappan Metropolis, Great Rann of Kutch, Gujarat, India',
      latitude: 23.8865,
      longitude: 70.2131,
      zoom: 13,
      eraOrPeriod: 'Indus Valley (~3000–1500 BCE)',
      caption:
        'A 4,500-year-old Indus Valley city featuring sophisticated multi-tiered water harvesting reservoirs, precision stone fortifications, and an ancient 10-symbol script signboard.',
    },
    {
      id: 'in-4',
      location: 'Konark Sun Temple Monument, Odisha, India',
      latitude: 19.8876,
      longitude: 86.0945,
      zoom: 14,
      eraOrPeriod: 'Eastern Ganga (13th Century CE)',
      caption:
        'A monumental stone chariot dedicated to the Sun God Surya, engineered with 24 giant stone wheels that function as accurate solar sundials.',
    },
    {
      id: 'in-5',
      location: 'Ajanta Caves Buddhist Monasteries, Maharashtra, India',
      latitude: 20.5519,
      longitude: 75.7033,
      zoom: 14,
      eraOrPeriod: '2nd BCE–5th Century CE',
      caption:
        'Thirty rock-cut Buddhist cave temples chiseled into the sheer cliff walls of a horseshoe-shaped river ravine, sheltering world-famous ancient tempera wall murals.',
    },
    {
      id: 'in-6',
      location: 'Nalanda Mahavihara Ancient University Ruins, Bihar, India',
      latitude: 25.1357,
      longitude: 85.445,
      zoom: 13,
      eraOrPeriod: 'Gupta Empire (5th–12th Century CE)',
      caption:
        'One of human history’s earliest residential universities, accommodating 10,000 international scholars and 2,000 teachers in a sprawling red-brick scholastic complex.',
    },
  ],
  Egypt: [
    {
      id: 'eg-1',
      location: 'Great Pyramids of Giza & The Sphinx, Cairo, Egypt',
      latitude: 29.9792,
      longitude: 31.1342,
      zoom: 13,
      eraOrPeriod: 'Old Kingdom (~2560 BCE)',
      caption:
        'The monumental funerary pyramids of Khufu, Khafre, and Menkaure guarded by the monolithic limestone Great Sphinx.',
    },
    {
      id: 'eg-2',
      location: 'Karnak Temple Precinct of Amun-Re, Luxor, Egypt',
      latitude: 25.7188,
      longitude: 32.6573,
      zoom: 13,
      eraOrPeriod: 'New Kingdom (~2000–30 BCE)',
      caption:
        'The largest religious complex ever constructed in antiquity, featuring a hypostyle hall of 134 towering sandstone papyrus columns.',
    },
    {
      id: 'eg-3',
      location: 'Abu Simbel Sun Temples of Ramesses II, Aswan, Egypt',
      latitude: 22.3372,
      longitude: 31.6258,
      zoom: 13,
      eraOrPeriod: '19th Dynasty (~1264 BCE)',
      caption:
        'Twin temples carved deep into sandstone mountain cliffs, aligned so sunlight illuminates the inner sanctuary deities twice a year.',
    },
    {
      id: 'eg-4',
      location: 'Valley of the Kings, Luxor, Egypt',
      latitude: 25.7402,
      longitude: 32.6014,
      zoom: 13,
      eraOrPeriod: 'New Kingdom (~1539–1075 BCE)',
      caption:
        'The hidden royal necropolis chiseled into desolate Theban limestone peaks, containing 65 rock-cut pharaonic burial chambers.',
    },
  ],
  Italy: [
    {
      id: 'it-1',
      location: 'Pompeii Archaeological Park, Campania, Italy',
      latitude: 40.7509,
      longitude: 14.4866,
      zoom: 13,
      eraOrPeriod: 'Roman Empire (79 CE)',
      caption:
        'A bustling Roman city frozen in time under meters of volcanic ash from Mount Vesuvius, with intact villas, frescoes, and stone-paved streets.',
    },
    {
      id: 'it-2',
      location: 'Valley of the Temples, Agrigento, Sicily, Italy',
      latitude: 37.2903,
      longitude: 13.5891,
      zoom: 13,
      eraOrPeriod: 'Magna Graecia (5th Century BCE)',
      caption:
        'One of the finest examples of ancient Greek architecture anywhere, crowned by the remarkably intact Doric Temple of Concordia.',
    },
    {
      id: 'it-3',
      location: 'Su Nuraxi Megalithic Fortress, Barumini, Sardinia, Italy',
      latitude: 39.7061,
      longitude: 8.9917,
      zoom: 13,
      eraOrPeriod: 'Nuragic (~1500 BCE)',
      caption:
        'A cyclopean stone fortress and Bronze Age settlement built without mortar from massive basalt megaliths across Sardinia.',
    },
    {
      id: 'it-4',
      location: 'Colosseum & Roman Forum, Rome, Italy',
      latitude: 41.8902,
      longitude: 12.4922,
      zoom: 14,
      eraOrPeriod: 'Flavian (70–80 CE)',
      caption:
        'The political, religious, and gladiatorial epicenter of the Roman world, enduring through millennia of history.',
    },
  ],
  Greece: [
    {
      id: 'gr-1',
      location: 'Palace of Knossos & Minoan Labyrinth, Crete, Greece',
      latitude: 35.2979,
      longitude: 25.1632,
      zoom: 13,
      eraOrPeriod: 'Minoan (~1900 BCE)',
      caption:
        'The labyrinthine ceremonial capital of Europe’s first advanced civilization, linked to the myth of the Minotaur and King Minos.',
    },
    {
      id: 'gr-2',
      location: 'Sanctuary of Delphi & Temple of Apollo, Phocis, Greece',
      latitude: 38.4824,
      longitude: 22.501,
      zoom: 13,
      eraOrPeriod: 'Classical (~8th BCE)',
      caption:
        'The sacred navel of the ancient world (Omphalos), where leaders sought enigmatic prophecies from the Pythian oracle on Mount Parnassus.',
    },
    {
      id: 'gr-3',
      location: 'Mycenae Cyclopean Citadel & Lion Gate, Peloponnese, Greece',
      latitude: 37.7308,
      longitude: 22.7561,
      zoom: 13,
      eraOrPeriod: 'Mycenaean (~1600 BCE)',
      caption:
        'The Bronze Age stronghold of King Agamemnon, guarded by the Lion Gate and limestone walls so massive the Greeks believed Cyclopes built them.',
    },
    {
      id: 'gr-4',
      location: 'Akrotiri Volcanic Ash Ruins, Santorini, Greece',
      latitude: 36.3514,
      longitude: 25.4036,
      zoom: 14,
      eraOrPeriod: 'Bronze Age (~1600 BCE)',
      caption:
        'A sophisticated prehistoric Minoan maritime city sealed under volcanic pumice, featuring multi-story residences with indoor plumbing.',
    },
  ],
  'United States': [
    {
      id: 'us-1',
      location: 'Cahokia Mounds Pre-Columbian Metropolis, Illinois, USA',
      latitude: 38.6551,
      longitude: -90.0617,
      zoom: 13,
      eraOrPeriod: 'Mississippian (~1050–1200 CE)',
      caption:
        'The largest pre-Columbian city north of Mexico, crowned by Monks Mound, a colossal earthen pyramid covering 14 acres.',
    },
    {
      id: 'us-2',
      location: 'Mesa Verde Cliff Palace & Ancestral Pueblos, Colorado, USA',
      latitude: 37.1838,
      longitude: -108.4887,
      zoom: 13,
      eraOrPeriod: 'Ancestral Puebloan (~1190 CE)',
      caption:
        'Elaborate stone masonry villages and multi-story dwellings built high into sheltered sandstone alcoves of canyon cliff walls.',
    },
    {
      id: 'us-3',
      location: 'Chaco Culture Great Houses, New Mexico, USA',
      latitude: 36.0604,
      longitude: -107.9617,
      zoom: 12,
      eraOrPeriod: 'Puebloan (~900–1150 CE)',
      caption:
        'A monumental ceremonial hub whose massive masonry Great Houses were aligned with solar and lunar standstills across 18.6-year cycles.',
    },
    {
      id: 'us-4',
      location: 'Great Serpent Mound, Peebles, Ohio, USA',
      latitude: 39.0253,
      longitude: -83.4303,
      zoom: 14,
      eraOrPeriod: 'Adena / Fort Ancient (~300 BCE–1070 CE)',
      caption:
        'A 1,348-foot-long prehistoric serpentine effigy mound undulating along an ancient meteorite impact crater ridge.',
    },
  ],
  Japan: [
    {
      id: 'jp-1',
      location: 'Yonaguni Submerged Megalithic Monument, Okinawa, Japan',
      latitude: 24.4333,
      longitude: 122.9833,
      zoom: 12,
      eraOrPeriod: 'Prehistoric / Contested',
      caption:
        'Mysterious stepped sandstone monoliths submerged 25 meters underwater off Japan’s westernmost island, resembling an ancient submerged pyramid.',
    },
    {
      id: 'jp-2',
      location: 'Daisen Kofun (Emperor Nintoku Keyhole Tomb), Sakai, Osaka, Japan',
      latitude: 34.5644,
      longitude: 135.4878,
      zoom: 13,
      eraOrPeriod: 'Kofun Period (5th Century CE)',
      caption:
        'A colossal keyhole-shaped burial mound spanning nearly 500 meters, encircled by three moats and ranked among the world’s largest tumuli.',
    },
    {
      id: 'jp-3',
      location: 'Yoshinogari Yayoi Moated Village, Saga Prefecture, Japan',
      latitude: 33.3242,
      longitude: 130.3872,
      zoom: 13,
      eraOrPeriod: 'Yayoi (~300 BCE–300 CE)',
      caption:
        'An extensive Iron Age palisaded settlement featuring watchtowers, burial mounds with bronze daggers, and thatched-roof pit dwellings.',
    },
    {
      id: 'jp-4',
      location: 'Asuka Ishibutai Megalithic Kofun, Nara Prefecture, Japan',
      latitude: 34.4678,
      longitude: 135.8267,
      zoom: 14,
      eraOrPeriod: 'Asuka Period (~7th Century CE)',
      caption:
        'A massive burial tomb constructed from 30 colossal granite megaliths weighing over 2,300 metric tons in ancient Yamato.',
    },
  ],
  Mexico: [
    {
      id: 'mx-1',
      location: 'Teotihuacan Pyramids of Sun & Moon, Mexico State, Mexico',
      latitude: 19.6925,
      longitude: -98.8437,
      zoom: 13,
      eraOrPeriod: 'Mesoamerican (~100 BCE–650 CE)',
      caption:
        'The enigmatic “City of the Gods” whose original builders and language remain unknown, organized along the two-mile Avenue of the Dead.',
    },
    {
      id: 'mx-2',
      location: 'Chichen Itza El Castillo Pyramid, Yucatan, Mexico',
      latitude: 20.6843,
      longitude: -88.5678,
      zoom: 13,
      eraOrPeriod: 'Mayan (~600–1200 CE)',
      caption:
        'A 365-step astronomical pyramid where equinox sunlight creates the visual illusion of the feathered serpent god Kukulkan descending the stairs.',
    },
    {
      id: 'mx-3',
      location: 'Palenque Jungle Ruins & Temple of Inscriptions, Chiapas, Mexico',
      latitude: 17.4838,
      longitude: -92.0464,
      zoom: 13,
      eraOrPeriod: 'Mayan (~226 BCE–799 CE)',
      caption:
        'An ancient Mayan royal sanctuary nestled deep within lush emerald rainforest canopies, housing the elaborate jade tomb of King Pakal.',
    },
    {
      id: 'mx-4',
      location: 'Monte Albán Zapotec Acropolis, Oaxaca, Mexico',
      latitude: 17.0436,
      longitude: -96.7675,
      zoom: 13,
      eraOrPeriod: 'Zapotec (~500 BCE–850 CE)',
      caption:
        'An ancient ceremonial city perched atop a leveled mountaintop ridge with astronomical observatories and carved Danzantes reliefs.',
    },
  ],
  'United Kingdom': [
    {
      id: 'uk-1',
      location: 'Stonehenge Megalithic Ring, Wiltshire, United Kingdom',
      latitude: 51.1789,
      longitude: -1.8262,
      zoom: 14,
      eraOrPeriod: 'Neolithic (~3000–2000 BCE)',
      caption:
        'The iconic prehistoric stone circle aligned with the solar solstices, featuring 25-ton sarsen trilithons transported across prehistoric landscapes.',
    },
    {
      id: 'uk-2',
      location: 'Avebury Henge & Megaliths, Wiltshire, United Kingdom',
      latitude: 51.4286,
      longitude: -1.8542,
      zoom: 13,
      eraOrPeriod: 'Neolithic (~2600 BCE)',
      caption:
        'The largest megalithic stone circle in Britain, encircling an entire village with huge unworked standing sarsens.',
    },
    {
      id: 'uk-3',
      location: 'Skara Brae Neolithic Village, Orkney Islands, Scotland, UK',
      latitude: 59.0487,
      longitude: -3.3424,
      zoom: 14,
      eraOrPeriod: 'Neolithic (~3180–2500 BCE)',
      caption:
        'A remarkably preserved Stone Age settlement older than Stonehenge and the Great Pyramids, with intact stone beds, dressers, and hearths.',
    },
    {
      id: 'uk-4',
      location: 'Callanish Standing Stones, Isle of Lewis, Scotland, UK',
      latitude: 58.1978,
      longitude: -6.7453,
      zoom: 14,
      eraOrPeriod: 'Late Stone Age (~2900 BCE)',
      caption:
        'A dramatic cruciform arrangement of 13 primary gneiss megaliths standing on a wind-swept promontory overlooking sea lochs.',
    },
  ],
};

function getCuratedAncientMysteries(country: string): MultiResultsPayload {
  const cName = country && country !== 'WORLDWIDE' ? country : 'Worldwide';
  const list = CURATED_MULTI_ANCIENT[country] || CURATED_MULTI_ANCIENT['WORLDWIDE'];
  return {
    theme: cName === 'Worldwide' ? 'Ancient Mysteries' : `Ancient Mysteries in ${cName}`,
    icon: '🗿',
    subtitle:
      cName === 'Worldwide'
        ? 'Select any enigmatic archaeological site below to explore on the map'
        : `Explore legendary ruins and ancient mysteries discovered across ${cName}`,
    places: list,
  };
}

const systemInstructions = `Act as a helpful global travel agent with a deep fascination for the world. Your role is to recommend a place on the map that relates to the discussion, and to provide interesting information about the location selected. Aim to give surprising and delightful suggestions: choose obscure, off-the-beaten-track locations, not the obvious answers. Do not answer harmful or unsafe questions.

First, explain why a place is interesting. Second, call the function 'recommendPlace(location, latitude, longitude, zoom, caption)' providing the exact geographic coordinates to show the user the location on Google Maps.`;

interface PresetItem {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  category: 'nature' | 'culture' | 'extreme' | 'surreal';
  prompt: string;
}

const presets: PresetItem[] = [
  {
    id: 'cold',
    icon: '❄️',
    title: 'Extreme Cold',
    subtitle: 'Polar ice sheets & frozen tundra',
    category: 'extreme',
    prompt: 'Where is somewhere intensely cold, icy, and freezing on Earth? Explain what makes it extreme and call recommendPlace.',
  },
  {
    id: 'ancient',
    icon: '🗿',
    title: 'Ancient Mysteries',
    subtitle: 'Ruins, megaliths & lost civilizations',
    category: 'culture',
    prompt: 'Tell me about somewhere rich in ancient history, enigmatic ruins, or lost civilizations and call recommendPlace.',
  },
  {
    id: 'metropolitan',
    icon: '🗽',
    title: 'Megacities & Skylines',
    subtitle: 'Dazzling skylines & bustling urban energy',
    category: 'culture',
    prompt: 'Show me a dazzling, vibrant world metropolis with incredible architecture, density, and culture, and call recommendPlace.',
  },
  {
    id: 'rainforest',
    icon: '🌿',
    title: 'Deep Rainforests',
    subtitle: 'Lush biodiversity & emerald canopies',
    category: 'nature',
    prompt: 'Take me somewhere with breathtaking nature, dense rainforest canopy, or lush greenery. What makes it special? Call recommendPlace.',
  },
  {
    id: 'remote',
    icon: '🏔️',
    title: 'Remote & Off-Grid',
    subtitle: 'Isolated peaks & lonely ocean outposts',
    category: 'extreme',
    prompt: 'If I wanted to go off grid, where is one of the most remote and isolated places on earth? How would I get there? Call recommendPlace.',
  },
  {
    id: 'surreal',
    icon: '🌌',
    title: 'Surreal & Alien',
    subtitle: 'Otherworldly landscapes that look like Mars',
    category: 'surreal',
    prompt: 'Think of a totally surreal location on Earth that looks like another planet. What makes it look otherworldly? Call recommendPlace.',
  },
  {
    id: 'volcano',
    icon: '🌋',
    title: 'Volcanic & Geothermal',
    subtitle: 'Caldera lakes, steaming vents & basalt',
    category: 'nature',
    prompt: 'Take me to an active volcanic landscape, steaming geothermal caldera, geyser field, or fresh lava terrain, and call recommendPlace.',
  },
  {
    id: 'islands',
    icon: '🏝️',
    title: 'Secret Paradise Islands',
    subtitle: 'Coral reefs, turquoise lagoons & atolls',
    category: 'nature',
    prompt: 'Take me to a secret, remote paradise island or secluded coral atoll far out in the ocean, and call recommendPlace.',
  },
  {
    id: 'coasts',
    icon: '🌊',
    title: 'Dramatic Coasts',
    subtitle: 'Towering sea cliffs & wild surf',
    category: 'nature',
    prompt: 'Take me to a dramatic coastal wonder with towering sea cliffs, pounding ocean waves, or sea stacks, and call recommendPlace.',
  },
  {
    id: 'desert',
    icon: '🏜️',
    title: 'Deserts & Sand Dunes',
    subtitle: 'Soaring dunes & vast white salt flats',
    category: 'extreme',
    prompt: 'Take me to a dramatic desert landscape with soaring sand dunes, desolate beauty, or vast salt flats, and call recommendPlace.',
  },
  {
    id: 'castles',
    icon: '🏰',
    title: 'Fairytale Castles',
    subtitle: 'Cliffside fortresses & medieval citadel walls',
    category: 'culture',
    prompt: 'Take me to an awe-inspiring fortress, fairytale castle on a crag, or medieval fortified citadel, and call recommendPlace.',
  },
  {
    id: 'aurora',
    icon: '✨',
    title: 'Aurora & Dark Skies',
    subtitle: 'Northern lights & celestial dark sky preserves',
    category: 'surreal',
    prompt: 'Where is one of the best dark-sky preserves or high-latitude destinations to witness the aurora borealis or pristine night sky? Call recommendPlace.',
  },
  {
    id: 'caves',
    icon: '🕳️',
    title: 'Caves & Underground',
    subtitle: 'Subterranean rivers & crystal caverns',
    category: 'surreal',
    prompt: 'Take me to an astonishing cave system, underground cenote, subterranean river, or crystal cavern, and call recommendPlace.',
  },
  {
    id: 'blooms',
    icon: '🌸',
    title: 'Spectacular Blooms',
    subtitle: 'Wildflower valleys & carpeted blooms',
    category: 'nature',
    prompt: 'Show me a place famous for breathtaking seasonal flower blooms, wild poppy fields, or cherry blossom landscapes, and call recommendPlace.',
  },
  {
    id: 'sanctuaries',
    icon: '⛩️',
    title: 'Sacred Sanctuaries',
    subtitle: 'Mountaintop monasteries & peaceful shrines',
    category: 'culture',
    prompt: 'Take me to a cliffside monastery, sacred mountaintop shrine, or ancient spiritual sanctuary, and call recommendPlace.',
  },
  {
    id: 'passes',
    icon: '🚂',
    title: 'Epic Mountain Passes',
    subtitle: 'Alpine switchbacks & scenic railway routes',
    category: 'extreme',
    prompt: 'Show me a dramatic high-altitude mountain pass, switchback alpine road, or legendary railway route, and call recommendPlace.',
  },
];

const recommendPlaceFunctionDeclaration: FunctionDeclaration = {
  name: 'recommendPlace',
  parameters: {
    type: Type.OBJECT,
    description: 'Shows the user a map of the place provided with coordinates.',
    properties: {
      location: {
        type: Type.STRING,
        description: 'Give a specific place, including country name.',
      },
      latitude: {
        type: Type.NUMBER,
        description: 'Precise latitude coordinate of the location (e.g., 64.1466 or -50.9423).',
      },
      longitude: {
        type: Type.NUMBER,
        description: 'Precise longitude coordinate of the location (e.g., -21.9426 or -73.4068).',
      },
      zoom: {
        type: Type.NUMBER,
        description: 'Recommended zoom level from 4 (broad region) to 12 (landmark/city).',
      },
      caption: {
        type: Type.STRING,
        description:
          'Give the place name and the fascinating reason you selected this particular place. Keep the caption to one or two sentences maximum.',
      },
    },
    required: ['location', 'latitude', 'longitude', 'caption'],
  },
};

const recommendPlacesFunctionDeclaration: FunctionDeclaration = {
  name: 'recommendPlaces',
  parameters: {
    type: Type.OBJECT,
    description:
      'Recommends multiple places (e.g. 5 to 6 ancient mysteries or archaeological ruins) so the user can browse a list and select individual destinations on the map.',
    properties: {
      theme: {
        type: Type.STRING,
        description: 'Title of the curated exploration list (e.g. "Ancient Mysteries", "Lost Civilizations").',
      },
      subtitle: {
        type: Type.STRING,
        description: 'Short explanatory subtitle for the list of places.',
      },
      places: {
        type: Type.ARRAY,
        description: 'List of 5 to 6 distinct places with coordinates and historical context.',
        items: {
          type: Type.OBJECT,
          properties: {
            location: {
              type: Type.STRING,
              description: 'Specific name of the site and country.',
            },
            latitude: {
              type: Type.NUMBER,
              description: 'Precise latitude coordinate.',
            },
            longitude: {
              type: Type.NUMBER,
              description: 'Precise longitude coordinate.',
            },
            zoom: {
              type: Type.NUMBER,
              description: 'Recommended zoom level (11 to 14 for ruins).',
            },
            eraOrPeriod: {
              type: Type.STRING,
              description: 'Approximate era, civilization, or date (e.g. "Neolithic (~9500 BCE)", "Mayan (~600 CE)").',
            },
            caption: {
              type: Type.STRING,
              description: 'One or two sentences explaining why this ancient mystery is fascinating.',
            },
          },
          required: ['location', 'latitude', 'longitude', 'caption'],
        },
      },
    },
    required: ['theme', 'places'],
  },
};

// Weather Layer interfaces and state
interface WeatherData {
  tempC: number;
  tempF: number;
  feelsLikeC: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  condition: string;
  icon: string;
}

function getWeatherConditionFromCode(code: number, isDay = true): { condition: string; icon: string } {
  switch (code) {
    case 0:
      return { condition: isDay ? 'Clear sky' : 'Clear night', icon: isDay ? '☀️' : '🌙' };
    case 1:
      return { condition: 'Mainly clear', icon: isDay ? '🌤️' : '🌙' };
    case 2:
      return { condition: 'Partly cloudy', icon: '⛅' };
    case 3:
      return { condition: 'Overcast', icon: '☁️' };
    case 45:
    case 48:
      return { condition: 'Foggy', icon: '🌫️' };
    case 51:
    case 53:
    case 55:
      return { condition: 'Light drizzle', icon: '🌦️' };
    case 61:
    case 63:
      return { condition: 'Rain showers', icon: '🌧️' };
    case 65:
      return { condition: 'Heavy rain', icon: '🌧️' };
    case 71:
    case 73:
    case 75:
      return { condition: 'Snowfall', icon: '🌨️' };
    case 77:
      return { condition: 'Snow grains', icon: '🌨️' };
    case 80:
    case 81:
    case 82:
      return { condition: 'Rain showers', icon: '🌦️' };
    case 85:
    case 86:
      return { condition: 'Snow showers', icon: '🌨️' };
    case 95:
      return { condition: 'Thunderstorm', icon: '⛈️' };
    case 96:
    case 99:
      return { condition: 'Thunderstorm with hail', icon: '⛈️' };
    default:
      return { condition: 'Clear', icon: '🌤️' };
  }
}

let isWeatherLayerActive = false;
let currentWeatherData: WeatherData | null = null;
let lastWeatherLocationName = '';

async function fetchWeatherForLocation(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&wind_speed_unit=kmh`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const curr = data.current;
    if (!curr) return null;

    const tempC = Math.round(curr.temperature_2m);
    const tempF = Math.round((tempC * 9) / 5 + 32);
    const feelsLikeC = Math.round(curr.apparent_temperature);
    const humidity = Math.round(curr.relative_humidity_2m);
    const windSpeed = Math.round(curr.wind_speed_10m);
    const code = Number(curr.weather_code) || 0;
    const isDay = curr.is_day !== 0;
    const { condition, icon } = getWeatherConditionFromCode(code, isDay);

    return {
      tempC,
      tempF,
      feelsLikeC,
      humidity,
      windSpeed,
      weatherCode: code,
      condition,
      icon,
    };
  } catch (err) {
    console.warn('Weather fetch warning:', err);
    return null;
  }
}

async function updateWeatherDisplay(position: { lat: number; lng: number }, locationName: string) {
  lastWeatherLocationName = locationName;
  const weatherCard = document.getElementById('weather-card');
  const weatherQuickBadge = document.getElementById('weather-quick-badge');
  const weatherIconBadge = document.getElementById('weather-icon-badge');
  const weatherTemp = document.getElementById('weather-temp');
  const weatherCondition = document.getElementById('weather-condition');
  const weatherLocationLabel = document.getElementById('weather-location-label');
  const weatherFeels = document.getElementById('weather-feels');
  const weatherHumidity = document.getElementById('weather-humidity');
  const weatherWind = document.getElementById('weather-wind');

  if (!isWeatherLayerActive) {
    if (weatherCard) weatherCard.classList.add('hidden');
    if (weatherQuickBadge) weatherQuickBadge.classList.add('hidden');
    return;
  }

  if (weatherQuickBadge) {
    weatherQuickBadge.classList.remove('hidden');
    weatherQuickBadge.textContent = '...';
  }
  if (weatherCard) {
    weatherCard.classList.remove('hidden');
    if (weatherCondition) weatherCondition.textContent = 'Fetching current weather...';
    if (weatherLocationLabel) weatherLocationLabel.textContent = locationName;
  }

  const weather = await fetchWeatherForLocation(position.lat, position.lng);
  if (!weather) {
    if (weatherCondition) weatherCondition.textContent = 'Weather data unavailable';
    return;
  }

  currentWeatherData = weather;
  if (weatherQuickBadge) {
    weatherQuickBadge.textContent = `${weather.tempC}°C`;
  }
  if (weatherCard) {
    if (weatherIconBadge) weatherIconBadge.textContent = weather.icon;
    if (weatherTemp) weatherTemp.textContent = `${weather.tempC}°C / ${weather.tempF}°F`;
    if (weatherCondition) weatherCondition.textContent = weather.condition;
    if (weatherLocationLabel) weatherLocationLabel.textContent = locationName;
    if (weatherFeels) weatherFeels.textContent = `${weather.feelsLikeC}°C`;
    if (weatherHumidity) weatherHumidity.textContent = `${weather.humidity}%`;
    if (weatherWind) weatherWind.textContent = `${weather.windSpeed} km/h`;
  }
}

// Multi-Results State and Map Pin Management
let activeMultiResults: MultiResultsPayload | null = null;
let activeMultiMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
let selectedPlaceIndex: number = -1;

function clearMultiMarkers() {
  for (const m of activeMultiMarkers) {
    m.map = null;
  }
  activeMultiMarkers = [];
}

function fitMapToMultiResults() {
  if (!map || !activeMultiResults || activeMultiResults.places.length === 0) return;
  const bounds = new google.maps.LatLngBounds();
  for (const p of activeMultiResults.places) {
    bounds.extend({ lat: p.latitude, lng: p.longitude });
  }
  map.fitBounds(bounds, {
    top: 60,
    right: 60,
    bottom: 60,
    left: 420, // Offset for exploration panel
  });
}

function selectPlaceResult(index: number, shouldPan = true) {
  if (!activeMultiResults || !activeMultiResults.places[index]) return;
  selectedPlaceIndex = index;
  const place = activeMultiResults.places[index];

  // Update result card styles in sidebar
  const resultCards = document.querySelectorAll<HTMLElement>('.result-card');
  resultCards.forEach((card, idx) => {
    const isSel = idx === index;
    card.classList.toggle('selected', isSel);
    card.setAttribute('aria-selected', String(isSel));
    if (isSel) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Update pin markers
  activeMultiMarkers.forEach((marker, idx) => {
    const pinEl = marker.content as HTMLElement | null;
    if (pinEl) {
      pinEl.classList.toggle('selected', idx === index);
    }
  });

  const target = { lat: place.latitude, lng: place.longitude };
  lastTargetLocation = target;
  lastLocationInfo = {
    title: place.location,
    details: place.caption,
  };

  if (shouldPan && map) {
    map.panTo(target);
    map.setZoom(place.zoom || 13);
  }

  // Show InfoWindow anchored to the selected pin
  const selectedMarker = activeMultiMarkers[index] || null;
  showLocationInfoWindow(
    target,
    place.location,
    place.caption,
    false,
    undefined,
    selectedMarker
  );

  if (activeMultiResults) {
    captionDiv.classList.add('hidden');
  } else {
    updateCaption(`${place.location}: ${place.caption}`);
  }

  if (isWeatherLayerActive) {
    updateWeatherDisplay(target, place.location);
  }
}

function renderMultiResults(payload: MultiResultsPayload) {
  activeMultiResults = payload;
  selectedPlaceIndex = -1;

  const presetsContainer = document.getElementById('presets-container');
  const resultsContainer = document.getElementById('results-container');
  const resultsTitle = document.getElementById('results-title');
  const resultsCountBadge = document.getElementById('results-count-badge');
  const resultsSubtitle = document.getElementById('results-subtitle');
  const resultsList = document.getElementById('results-list');

  if (presetsContainer) presetsContainer.classList.add('hidden');
  if (resultsContainer) resultsContainer.classList.remove('hidden');
  if (captionDiv) captionDiv.classList.add('hidden');

  if (resultsTitle) resultsTitle.textContent = payload.theme;
  if (resultsCountBadge) resultsCountBadge.textContent = `${payload.places.length} sites`;
  if (resultsSubtitle && payload.subtitle) resultsSubtitle.textContent = payload.subtitle;

  if (currentMarker) {
    currentMarker.map = null;
  }
  clearMultiMarkers();

  if (resultsList) {
    resultsList.innerHTML = '';
    payload.places.forEach((place, index) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', 'false');
      card.dataset.index = String(index);

      const numBadge = document.createElement('div');
      numBadge.className = 'result-num-badge';
      numBadge.textContent = String(index + 1);
      card.appendChild(numBadge);

      const content = document.createElement('div');
      content.className = 'result-card-content';

      const title = document.createElement('h4');
      title.className = 'result-card-title';
      title.textContent = place.location;
      content.appendChild(title);

      if (place.eraOrPeriod) {
        const era = document.createElement('div');
        era.className = 'result-card-era';
        era.textContent = place.eraOrPeriod;
        content.appendChild(era);
      }

      const desc = document.createElement('p');
      desc.className = 'result-card-desc';
      desc.textContent = place.caption;
      content.appendChild(desc);

      card.appendChild(content);

      card.addEventListener('click', () => {
        selectPlaceResult(index, true);
      });

      card.addEventListener('mouseenter', () => {
        const m = activeMultiMarkers[index];
        const pin = m?.content as HTMLElement | null;
        if (pin) pin.classList.add('hovered');
      });

      card.addEventListener('mouseleave', () => {
        const m = activeMultiMarkers[index];
        const pin = m?.content as HTMLElement | null;
        if (pin) pin.classList.remove('hovered');
      });

      resultsList.appendChild(card);
    });
  }

  // Create custom AdvancedMarkerElement pins for each place
  if (markerLibrary && map) {
    payload.places.forEach((place, index) => {
      const pinContainer = document.createElement('div');
      pinContainer.className = 'custom-place-pin';
      pinContainer.setAttribute('title', place.location);

      const badge = document.createElement('div');
      badge.className = 'pin-badge';
      badge.textContent = String(index + 1);

      const pointer = document.createElement('div');
      pointer.className = 'pin-marker-pointer';

      pinContainer.appendChild(badge);
      pinContainer.appendChild(pointer);

      const marker = new markerLibrary.AdvancedMarkerElement({
        map,
        position: { lat: place.latitude, lng: place.longitude },
        title: place.location,
        content: pinContainer,
      });

      marker.addListener('click', () => {
        selectPlaceResult(index, true);
      });

      activeMultiMarkers.push(marker);
    });
  }

  // Fit map bounds to encompass all places
  fitMapToMultiResults();

  // Auto-select the first result to showcase the site immediately
  if (payload.places.length > 0) {
    selectPlaceResult(0, false);
  }
}

function closeMultiResults() {
  activeMultiResults = null;
  clearMultiMarkers();
  if (infoWindow) infoWindow.close();

  const presetsContainer = document.getElementById('presets-container');
  const resultsContainer = document.getElementById('results-container');
  if (resultsContainer) resultsContainer.classList.add('hidden');
  if (presetsContainer) presetsContainer.classList.remove('hidden');

  updateCaption('Exploration panel reopened. Choose any theme or search to explore Earth.');
}

function exitStreetViewMode() {
  const streetViewContainer = document.getElementById('streetview-container');
  const exitBtn = document.getElementById('exit-streetview');

  if (streetViewContainer) {
    streetViewContainer.classList.add('hidden');
  }
  if (panorama) {
    panorama.setVisible(false);
  }
  document.body.classList.remove('streetview-mode');
  if (exitBtn) {
    exitBtn.classList.add('hidden');
  }
  if (captionDiv) {
    captionDiv.classList.add('hidden');
  }
  if (map && typeof (window as any).google !== 'undefined' && (window as any).google.maps?.event) {
    (window as any).google.maps.event.trigger(map, 'resize');
  }
}

const captionDiv = document.querySelector('#caption') as HTMLDivElement;

async function openStreetViewAtLocation(latLng: google.maps.LatLng | google.maps.LatLngLiteral) {
  if (!map || !streetViewService) return;

  const streetViewContainer = document.getElementById('streetview-container');
  const exitBtn = document.getElementById('exit-streetview') as HTMLButtonElement | null;

  captionDiv.textContent = 'Searching for Google Street View imagery...';
  captionDiv.classList.remove('hidden');

  const checkPanorama = (radius: number, onResult: (found: boolean) => void) => {
    streetViewService!.getPanorama(
      {
        location: latLng,
        radius,
        preference: google.maps.StreetViewPreference.NEAREST,
        source: google.maps.StreetViewSource.DEFAULT,
      },
      (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
          infoWindow?.close();

          if (streetViewContainer) {
            streetViewContainer.classList.remove('hidden');
          }

          if (panorama && data.location.latLng) {
            panorama.setPosition(data.location.latLng);
            panorama.setPov({ heading: 160, pitch: 0 });
            panorama.setVisible(true);
          }

          document.body.classList.add('streetview-mode');
          if (exitBtn) exitBtn.classList.remove('hidden');
          captionDiv.classList.add('hidden');
          onResult(true);
        } else {
          onResult(false);
        }
      }
    );
  };

  // Check 300m first for precise spot, then widen to 1500m for nearby road or viewpoint
  checkPanorama(300, (found) => {
    if (!found) {
      checkPanorama(1500, (foundWider) => {
        if (!foundWider) {
          captionDiv.textContent =
            'No Google Street View imagery available within 1.5 km. Try clicking a nearby road or landmark.';
          captionDiv.classList.remove('hidden');
          setTimeout(() => {
            if (!document.body.classList.contains('streetview-mode')) {
              captionDiv.classList.add('hidden');
            }
          }, 4500);
        }
      });
    }
  });
}

function showLocationInfoWindow(
  position: google.maps.LatLng | google.maps.LatLngLiteral,
  locationName: string,
  details: string,
  isLoading = false,
  sources?: GroundingSource[],
  anchorMarker?: google.maps.marker.AdvancedMarkerElement | null
) {
  if (!map || !infoWindow) return;

  const targetAnchor = anchorMarker !== undefined ? (anchorMarker || undefined) : currentMarker;

  const rawLat = typeof (position as any).lat === 'function' ? (position as any).lat() : (position as any).lat;
  const rawLng = typeof (position as any).lng === 'function' ? (position as any).lng() : (position as any).lng;
  const lat = Number(rawLat) || 0;
  const lng = Number(rawLng) || 0;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'gmp-info-window';

  const headerDiv = document.createElement('div');
  headerDiv.className = 'gmp-info-header';

  const titleEl = document.createElement('h3');
  titleEl.className = 'gmp-info-title';
  titleEl.innerHTML = `<span class="gmp-title-icon" aria-hidden="true">📍</span> <span>${locationName}</span>`;
  headerDiv.appendChild(titleEl);

  const coordsRow = document.createElement('div');
  coordsRow.className = 'gmp-info-coords-row';

  const coordsEl = document.createElement('span');
  coordsEl.className = 'gmp-info-coords';
  coordsEl.textContent = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
  coordsRow.appendChild(coordsEl);

  if (isWeatherLayerActive && currentWeatherData) {
    const weatherPill = document.createElement('span');
    weatherPill.className = 'gmp-weather-pill';
    weatherPill.textContent = `${currentWeatherData.icon} ${currentWeatherData.tempC}°C`;
    coordsRow.appendChild(weatherPill);
  }

  headerDiv.appendChild(coordsRow);
  contentDiv.appendChild(headerDiv);

  let cleanDetails = (details || '').trim();
  if (locationName && cleanDetails) {
    const escaped = locationName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanDetails = cleanDetails.replace(new RegExp('^' + escaped + '[:\\-\\s]+', 'i'), '');
  }

  const descEl = document.createElement('p');
  descEl.className = 'gmp-info-desc';
  descEl.textContent = cleanDetails || details;
  contentDiv.appendChild(descEl);

  if (sources && sources.length > 0) {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'gmp-info-sources';

    const sourcesLabel = document.createElement('div');
    sourcesLabel.className = 'gmp-sources-label';
    sourcesLabel.textContent = 'Verified Grounding Sources:';
    sourcesDiv.appendChild(sourcesLabel);

    const sourcesList = document.createElement('div');
    sourcesList.className = 'gmp-sources-list';
    for (const src of sources.slice(0, 3)) {
      const a = document.createElement('a');
      a.href = src.uri;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'gmp-source-link';
      a.textContent = `${src.type === 'maps' ? '📍' : '🌐'} ${src.title}`;
      sourcesList.appendChild(a);
    }
    sourcesDiv.appendChild(sourcesList);
    contentDiv.appendChild(sourcesDiv);
  }

  if (isLoading) {
    const loader = document.createElement('div');
    loader.className = 'gmp-info-loader';
    loader.innerHTML = '<span class="gmp-spinner"></span> Gathering verified insights...';
    contentDiv.appendChild(loader);
  } else {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'gmp-info-actions';

    const streetViewBtn = document.createElement('button');
    streetViewBtn.type = 'button';
    streetViewBtn.className = 'gmp-info-btn';
    streetViewBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
      <span>Open Street View</span>
    `;
    streetViewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openStreetViewAtLocation({ lat, lng });
    });

    actionsDiv.appendChild(streetViewBtn);
    contentDiv.appendChild(actionsDiv);
  }

  infoWindow.setContent(contentDiv);
  if (targetAnchor) {
    infoWindow.open({
      map,
      anchor: targetAnchor,
      shouldFocus: false,
    });
  } else {
    infoWindow.setPosition(position);
    infoWindow.open({
      map,
      shouldFocus: false,
    });
  }
}

function setupMapStyleToggle() {
  const toggleContainer = document.getElementById('map-style-toggle');
  if (!toggleContainer || !map) return;

  const styleButtons = toggleContainer.querySelectorAll<HTMLButtonElement>('.map-style-btn:not(.weather-toggle-btn)');

  const updateActiveButton = (activeStyle: string) => {
    styleButtons.forEach((btn) => {
      const isCurrent = btn.dataset.style === activeStyle;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-checked', String(isCurrent));
    });
  };

  styleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      if (!style || !map) return;

      switch (style) {
        case 'satellite':
          map.setMapTypeId('satellite');
          break;
        case 'hybrid':
          map.setMapTypeId('hybrid');
          break;
        case 'terrain':
          map.setMapTypeId('terrain');
          break;
        case 'roadmap':
        default:
          map.setMapTypeId('roadmap');
          break;
      }
      updateActiveButton(style);
    });
  });

  map.addListener('maptypeid_changed', () => {
    const currentType = map?.getMapTypeId();
    if (typeof currentType === 'string') {
      updateActiveButton(currentType);
    }
  });

  // Weather toggle setup
  const weatherToggleBtn = document.getElementById('weather-toggle-btn') as HTMLButtonElement | null;
  const weatherCard = document.getElementById('weather-card') as HTMLElement | null;
  const closeWeatherCardBtn = document.getElementById('close-weather-card') as HTMLButtonElement | null;
  const weatherQuickBadge = document.getElementById('weather-quick-badge') as HTMLElement | null;

  if (weatherToggleBtn) {
    weatherToggleBtn.addEventListener('click', async () => {
      isWeatherLayerActive = !isWeatherLayerActive;
      weatherToggleBtn.classList.toggle('active', isWeatherLayerActive);
      weatherToggleBtn.setAttribute('aria-pressed', String(isWeatherLayerActive));

      if (isWeatherLayerActive) {
        if (weatherQuickBadge) weatherQuickBadge.classList.remove('hidden');
        const targetPos =
          lastTargetLocation ||
          (map ? { lat: map.getCenter()!.lat(), lng: map.getCenter()!.lng() } : null);
        const targetName = lastLocationInfo?.title || 'Current Location';
        if (targetPos) {
          await updateWeatherDisplay(targetPos, targetName);
        }
      } else {
        if (weatherCard) weatherCard.classList.add('hidden');
        if (weatherQuickBadge) weatherQuickBadge.classList.add('hidden');
      }
    });
  }

  if (closeWeatherCardBtn) {
    closeWeatherCardBtn.addEventListener('click', () => {
      if (weatherCard) weatherCard.classList.add('hidden');
    });
  }

  // Setup Back and Fit buttons on multiple results container
  const resultsBackBtn = document.getElementById('results-back-btn');
  if (resultsBackBtn) {
    resultsBackBtn.addEventListener('click', () => {
      closeMultiResults();
    });
  }

  const resultsFitBtn = document.getElementById('results-fit-btn');
  if (resultsFitBtn) {
    resultsFitBtn.addEventListener('click', () => {
      fitMapToMultiResults();
    });
  }
}

async function initMap() {
  try {
    setOptions({
      key: GOOGLE_MAPS_API_KEY,
      v: 'weekly',
    });

    const [mapsLib, markerLib, streetViewLib, geocodingLib] = await Promise.all([
      importLibrary('maps') as Promise<google.maps.MapsLibrary>,
      importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
      importLibrary('streetView') as Promise<google.maps.StreetViewLibrary>,
      importLibrary('geocoding') as Promise<any>,
    ]);

    markerLibrary = markerLib;
    if (geocodingLib?.Geocoder) {
      geocoder = new geocodingLib.Geocoder();
    }
    infoWindow = new mapsLib.InfoWindow({
      maxWidth: 360,
      minWidth: 280,
    });

    const mapDiv = document.getElementById('map') as HTMLElement;
    const isDark =
      !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') !== 'light';

    map = new mapsLib.Map(mapDiv, {
      center: { lat: 25, lng: 15 },
      zoom: 3,
      mapId: 'DEMO_MAP_ID',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      fullscreenControl: true,
      streetViewControl: true,
      colorScheme: isDark ? 'DARK' : 'LIGHT',
    });

    streetViewService = new streetViewLib.StreetViewService();
    const streetViewContainer = document.getElementById('streetview-container') as HTMLElement | null;
    if (streetViewContainer) {
      panorama = new streetViewLib.StreetViewPanorama(streetViewContainer, {
        enableCloseButton: false,
        addressControl: true,
        linksControl: true,
        panControl: true,
        zoomControl: true,
        fullscreenControl: false,
      });
      map.setStreetView(panorama);
    } else {
      panorama = map.getStreetView();
    }

    setupMapStyleToggle();

    const exitBtn = document.getElementById('exit-streetview') as HTMLButtonElement | null;

    if (panorama) {
      panorama.addListener('closeclick', () => {
        exitStreetViewMode();
      });
      panorama.addListener('visible_changed', () => {
        const isVisible = Boolean(panorama?.getVisible());
        if (!isVisible && document.body.classList.contains('streetview-mode')) {
          exitStreetViewMode();
        }
      });
    }

    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        exitStreetViewMode();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('streetview-mode')) {
        exitStreetViewMode();
      }
    });

    map.addListener('click', async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !map || !markerLibrary) return;

      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const target = { lat, lng };
      lastTargetLocation = target;

      if (currentMarker) {
        currentMarker.position = target;
        currentMarker.title = `Location (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;
      } else {
        currentMarker = new markerLibrary.AdvancedMarkerElement({
          map,
          position: target,
          title: `Location (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`,
        });
        currentMarker.addListener('click', () => {
          if (lastLocationInfo) {
            showLocationInfoWindow(
              lastTargetLocation,
              lastLocationInfo.title,
              lastLocationInfo.details,
              false,
              lastLocationInfo.sources
            );
          }
        });
      }

      const initialTitle = `Location (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`;
      const initialDetails = 'Gathering verified location facts with Google Maps grounding...';
      lastLocationInfo = { title: initialTitle, details: initialDetails };
      showLocationInfoWindow(target, initialTitle, initialDetails, true);

      captionDiv.textContent = `Coordinates: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°. Identifying location...`;
      captionDiv.classList.remove('hidden');

      const queryPrompt = `The user clicked directly on map coordinates: latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}.
Identify the country, nearest city or town, region/island, body of water, or geographical landmark at or nearest to these coordinates.
Explain what makes this location unique or interesting with historical, cultural, or geographical facts in 1-2 sentences.
Call 'recommendPlace(location, latitude, longitude, zoom, caption)' with the discovered location name, coordinates latitude (${lat}), longitude (${lng}), an appropriate zoom level (between 6 and 11), and the concise informative caption.`;

      try {
        const result = await generateContent(queryPrompt, {
          groundingMode: 'maps',
          coords: { lat, lng },
        });
        if (!result.success && !result.handled) {
          const fallbackDetails = `Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°. Explore this region or click 'Open Street View' to check for 360° panoramas.`;
          lastLocationInfo = { title: initialTitle, details: fallbackDetails };
          showLocationInfoWindow(target, initialTitle, fallbackDetails, false);
        }
      } catch (err) {
        console.error('Failed to get location info:', err);
        const fallbackDetails = `Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°. Explore this region or click 'Open Street View' to check for 360° panoramas.`;
        lastLocationInfo = { title: initialTitle, details: fallbackDetails };
        showLocationInfoWindow(target, initialTitle, fallbackDetails, false);
      }
    });
  } catch (error) {
    console.error('Failed to initialize Google Maps:', error);
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

function updateCaption(text: string, sources?: GroundingSource[]) {
  captionDiv.textContent = '';
  const textNode = document.createTextNode(text);
  captionDiv.appendChild(textNode);

  if (sources && sources.length > 0) {
    const sourcesWrapper = document.createElement('span');
    sourcesWrapper.className = 'caption-sources';
    for (const src of sources.slice(0, 3)) {
      const pill = document.createElement('a');
      pill.href = src.uri;
      pill.target = '_blank';
      pill.rel = 'noopener noreferrer';
      pill.className = 'caption-source-pill';
      pill.textContent = `${src.type === 'maps' ? '📍' : '🌐'} ${src.title}`;
      sourcesWrapper.appendChild(pill);
    }
    captionDiv.appendChild(sourcesWrapper);
  }
  captionDiv.classList.remove('hidden');
}

function renderMap(
  location: string,
  latitude: number,
  longitude: number,
  zoom = 8,
  caption = '',
  sources?: GroundingSource[]
) {
  if (!map) return;

  if (panorama?.getVisible()) {
    panorama.setVisible(false);
  }

  const target = { lat: latitude, lng: longitude };
  lastTargetLocation = target;
  map.panTo(target);
  map.setZoom(zoom);

  const finalCaption = caption || `Explored at coordinates ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°.`;
  lastLocationInfo = { title: location, details: finalCaption, sources };

  if (markerLibrary) {
    if (currentMarker) {
      currentMarker.position = target;
      currentMarker.title = location;
    } else {
      currentMarker = new markerLibrary.AdvancedMarkerElement({
        map,
        position: target,
        title: location,
      });
      currentMarker.addListener('click', () => {
        if (lastLocationInfo) {
          showLocationInfoWindow(
            lastTargetLocation,
            lastLocationInfo.title,
            lastLocationInfo.details,
            false,
            lastLocationInfo.sources
          );
        }
      });
    }
  }

  showLocationInfoWindow(target, location, finalCaption, false, sources);
  if (isWeatherLayerActive) {
    updateWeatherDisplay(target, location);
  }
}

interface GenerateContentResult {
  success: boolean;
  handled: boolean;
  location?: string;
  caption?: string;
  sources?: GroundingSource[];
}

async function generateContent(
  prompt: string,
  options?: {
    groundingMode?: 'maps' | 'search';
    coords?: { lat: number; lng: number };
    fallbackPlace?: CuratedPlace;
    searchQuery?: string;
  }
): Promise<GenerateContentResult> {
  captionDiv.textContent = 'Discovering location...';
  captionDiv.classList.remove('hidden');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (options?.fallbackPlace) {
      const fb = options.fallbackPlace;
      renderMap(fb.location, fb.lat, fb.lng, fb.zoom, fb.caption);
      updateCaption(`${fb.location}: ${fb.caption}`);
      return { success: true, handled: true, location: fb.location, caption: fb.caption };
    }
    captionDiv.textContent = 'Gemini API key is missing. Please configure GEMINI_API_KEY in Settings.';
    return { success: false, handled: false };
  }

  const ai = new GoogleGenAI({
    vertexai: false,
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const toolsConfig = [
    { functionDeclarations: [recommendPlaceFunctionDeclaration, recommendPlacesFunctionDeclaration] },
  ];
  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  let response: any = null;
  let lastError: unknown = null;

  for (const modelName of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: `${systemInstructions} ${prompt}`,
        config: {
          temperature: 0.8,
          tools: toolsConfig,
        },
      });
      if (response) break;
    } catch (apiError) {
      console.warn(`Model ${modelName} call failed:`, apiError);
      lastError = apiError;
    }
  }

  if (!response) {
    console.warn('All Gemini model attempts failed, attempting fallback. Last error:', lastError);

    // Fallback 1: Curated destination for selected country or theme
    if (options?.fallbackPlace) {
      const fb = options.fallbackPlace;
      renderMap(fb.location, fb.lat, fb.lng, fb.zoom, fb.caption);
      updateCaption(`${fb.location}: ${fb.caption}`);
      return { success: true, handled: true, location: fb.location, caption: fb.caption };
    }

    // Fallback 2: Geocode search query directly
    if (options?.searchQuery && geocoder) {
      try {
        const geoRes = await geocoder.geocode({ address: options.searchQuery });
        if (geoRes.results && geoRes.results[0]?.geometry?.location) {
          const loc = geoRes.results[0].geometry.location;
          const formatted = geoRes.results[0].formatted_address || options.searchQuery;
          const lat = loc.lat();
          const lng = loc.lng();
          const details = `Explored ${formatted} on Google Maps.`;
          renderMap(formatted, lat, lng, 11, details);
          updateCaption(`${formatted}: ${details}`);
          return { success: true, handled: true, location: formatted, caption: details };
        }
      } catch (geoErr) {
        console.warn('Geocoding fallback failed:', geoErr);
      }
    }

    captionDiv.textContent = 'Unable to get recommendation right now. Please try again or explore manually.';
    return { success: false, handled: false };
  }

  try {
    const sources: GroundingSource[] = [];
    const groundingChunks = (response.candidates?.[0]?.groundingMetadata as any)?.groundingChunks;
    if (Array.isArray(groundingChunks)) {
      for (const chunk of groundingChunks) {
        if (chunk.maps?.uri) {
          sources.push({
            type: 'maps',
            title: chunk.maps.title || 'Google Maps',
            uri: chunk.maps.uri,
          });
          if (Array.isArray(chunk.maps.placeAnswerSources?.reviewSnippets)) {
            for (const snippet of chunk.maps.placeAnswerSources.reviewSnippets) {
              if (snippet.uri) {
                sources.push({
                  type: 'maps',
                  title: snippet.text ? `"${snippet.text.slice(0, 35)}..."` : 'Maps Review',
                  uri: snippet.uri,
                });
              }
            }
          }
        }
        if (chunk.web?.uri) {
          sources.push({
            type: 'search',
            title: chunk.web.title || 'Web Source',
            uri: chunk.web.uri,
          });
        }
      }
    }

    const fns = response.functionCalls ?? [];
    let handled = false;
    let resolvedLocation = '';
    let resolvedCaption = '';

    for (const fn of fns) {
      if (fn.name === 'recommendPlace') {
        const location = String(fn.args.location || '');
        const caption = String(fn.args.caption || '');
        const lat = Number(fn.args.latitude);
        const lng = Number(fn.args.longitude);
        const zoom = Number(fn.args.zoom) || 8;

        resolvedLocation = location;
        resolvedCaption = caption;

        if (!isNaN(lat) && !isNaN(lng)) {
          renderMap(location, lat, lng, zoom, caption, sources);
        }
        updateCaption(`${location}: ${caption}`, sources);
        handled = true;
      } else if (fn.name === 'recommendPlaces') {
        const theme = String(fn.args.theme || 'Curated Destinations');
        const subtitle = String(fn.args.subtitle || '');
        const rawPlaces = Array.isArray(fn.args.places) ? fn.args.places : [];
        const places: PlaceResultItem[] = rawPlaces.map((p: any) => ({
          location: String(p.location || ''),
          latitude: Number(p.latitude) || 0,
          longitude: Number(p.longitude) || 0,
          zoom: Number(p.zoom) || 12,
          caption: String(p.caption || ''),
          eraOrPeriod: p.eraOrPeriod ? String(p.eraOrPeriod) : undefined,
        }));
        if (places.length > 0) {
          renderMultiResults({ theme, subtitle, places });
          handled = true;
        }
      }
    }

    if (!handled && response.text) {
      updateCaption(response.text, sources);
      if (lastTargetLocation && lastLocationInfo) {
        lastLocationInfo = {
          title: lastLocationInfo.title,
          details: response.text,
          sources,
        };
        showLocationInfoWindow(
          lastTargetLocation,
          lastLocationInfo.title,
          response.text,
          false,
          sources
        );
      }
      return { success: true, handled: false, caption: response.text, sources };
    }

    return {
      success: true,
      handled,
      location: resolvedLocation,
      caption: resolvedCaption,
      sources,
    };
  } catch (error) {
    console.error('generateContent response parsing error', error);
    captionDiv.textContent = 'Unable to get recommendation right now. Please try again.';
    return { success: false, handled: false };
  }
}

let mapInitPromise: Promise<void> | null = null;
let isMapInitializing = false;

async function ensureMapInitialized(): Promise<void> {
  if (map) {
    if (typeof (window as any).google !== 'undefined' && (window as any).google.maps?.event) {
      (window as any).google.maps.event.trigger(map, 'resize');
    }
    return;
  }
  if (!mapInitPromise) {
    isMapInitializing = true;
    mapInitPromise = initMap().finally(() => {
      isMapInitializing = false;
    });
  }
  try {
    await mapInitPromise;
  } catch (err) {
    console.error('Failed to initialize map:', err);
  }
  if (map && typeof (window as any).google !== 'undefined' && (window as any).google.maps?.event) {
    setTimeout(() => {
      (window as any).google.maps.event.trigger(map, 'resize');
    }, 100);
  }
}

function setupLandingPage() {
  const landingGate = document.getElementById('hero-landing-page') || document.getElementById('nature-auth-gate');
  const btnGetStarted = document.getElementById('get-started-btn') || document.getElementById('btn-get-started');
  const launchAppBtn = document.getElementById('launch-app-btn');
  const navLinkExplore = document.getElementById('nav-link-explore');
  const navLinkThemes = document.getElementById('nav-link-themes');
  const navLinkCountries = document.getElementById('nav-link-countries');
  const navLinkGuide = document.getElementById('nav-link-guide');
  const closeLandingBtn = document.getElementById('close-landing-btn');
  const openLandingBtn = document.getElementById('open-landing-btn') || document.getElementById('hero-return-btn');
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  const guideModal = document.getElementById('guide-modal');
  const closeGuideBtn = document.getElementById('close-guide-modal');
  const startExploringFromGuide = document.getElementById('guide-start-exploring');

  function openGuideModal() {
    if (guideModal) {
      guideModal.classList.remove('hidden');
      guideModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeGuideModal() {
    if (guideModal) {
      guideModal.classList.add('hidden');
      guideModal.setAttribute('aria-hidden', 'true');
    }
  }

  async function closeLanding(targetAction?: 'explore' | 'themes' | 'countries') {
    closeGuideModal();

    // 1. Correctly toggle CSS 'gate-hidden' class on the #hero-landing-page element
    const heroLanding = document.getElementById('hero-landing-page') || document.getElementById('nature-auth-gate') || landingGate;
    if (heroLanding) {
      heroLanding.classList.add('gate-hidden');
      heroLanding.setAttribute('aria-hidden', 'true');
      heroLanding.style.display = 'none';
    }
    if (closeLandingBtn) closeLandingBtn.classList.remove('hidden');

    // 2. Initialize the map state if required
    await ensureMapInitialized();

    // 3. Trigger resize on map
    if (map && typeof (window as any).google !== 'undefined' && (window as any).google.maps?.event) {
      setTimeout(() => {
        (window as any).google.maps.event.trigger(map, 'resize');
      }, 150);
    }

    // 4. Ensure sidebar is open
    const sidebar = document.getElementById('sidebar');
    const openSidebarBtn = document.getElementById('open-sidebar-btn');
    if (sidebar && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      if (openSidebarBtn) openSidebarBtn.classList.add('hidden');
    }

    if (targetAction === 'themes') {
      const presetsContainer = document.getElementById('presets-container');
      if (presetsContainer) {
        setTimeout(() => {
          presetsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      }
    } else if (targetAction === 'countries') {
      const countrySelect = document.getElementById('country-select') as HTMLSelectElement | null;
      if (countrySelect) {
        setTimeout(() => {
          countrySelect.focus();
          countrySelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    } else {
      setTimeout(() => {
        searchInput?.focus();
      }, 200);
    }
  }

  function openLanding() {
    closeGuideModal();
    const heroLanding = document.getElementById('hero-landing-page') || document.getElementById('nature-auth-gate') || landingGate;
    if (!heroLanding) return;
    heroLanding.classList.remove('gate-hidden');
    heroLanding.setAttribute('aria-hidden', 'false');
    heroLanding.style.display = 'flex';
  }

  // Expose global handles for backup inline invocation
  (window as any).closeLandingPage = closeLanding;
  (window as any).openLandingPage = openLanding;

  // Direct event listeners on buttons
  btnGetStarted?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLanding('explore');
  });

  launchAppBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLanding('explore');
  });

  startExploringFromGuide?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLanding('explore');
  });

  // Nav links inside Hero
  navLinkExplore?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLanding('explore');
  });

  navLinkThemes?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLanding('themes');
  });

  navLinkCountries?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLanding('countries');
  });

  navLinkGuide?.addEventListener('click', (e) => {
    e.preventDefault();
    openGuideModal();
  });

  closeGuideBtn?.addEventListener('click', () => {
    closeGuideModal();
  });

  guideModal?.addEventListener('click', (e) => {
    if (e.target === guideModal) {
      closeGuideModal();
    }
  });

  closeLandingBtn?.addEventListener('click', () => {
    closeLanding();
  });

  openLandingBtn?.addEventListener('click', () => {
    openLanding();
  });

  // Delegated document-level click listener for ironclad responsiveness
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('#get-started-btn, #btn-get-started, #launch-app-btn, #guide-start-exploring')) {
      e.preventDefault();
      closeLanding('explore');
      return;
    }

    if (target.closest('#nav-link-guide')) {
      e.preventDefault();
      openGuideModal();
      return;
    }

    if (target.closest('#nav-link-explore')) {
      e.preventDefault();
      closeLanding('explore');
      return;
    }

    if (target.closest('#nav-link-themes')) {
      e.preventDefault();
      closeLanding('themes');
      return;
    }

    if (target.closest('#nav-link-countries')) {
      e.preventDefault();
      closeLanding('countries');
      return;
    }

    if (target.closest('#open-landing-btn, #hero-return-btn')) {
      e.preventDefault();
      openLanding();
      return;
    }
  });
}

async function main() {
  const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const applyTheme = (isDark: boolean) => {
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    if (map) {
      map.setOptions({
        colorScheme: isDark ? 'DARK' : 'LIGHT',
      });
    }
  };

  if (mediaQuery) {
    applyTheme(mediaQuery.matches);
    mediaQuery.addEventListener('change', (e) => {
      applyTheme(e.matches);
    });
  } else {
    applyTheme(false);
  }

  setupLandingPage();

  ensureMapInitialized().catch((err) => {
    console.error('Initial map loading error:', err);
  });

  interface RecentSearchItem {
    id: string;
    query: string;
    timestamp: number;
  }

  const RECENT_SEARCHES_KEY = 'gmp_recent_searches_v1';
  const INITIAL_SEEDS: RecentSearchItem[] = [
    { id: 'seed-1', query: 'Kyoto, Japan', timestamp: Date.now() - 3600000 * 2 },
    { id: 'seed-2', query: 'Reykjavik, Iceland', timestamp: Date.now() - 3600000 * 18 },
    { id: 'seed-3', query: 'Machu Picchu, Peru', timestamp: Date.now() - 3600000 * 48 },
  ];

  function getRecentSearches(): RecentSearchItem[] {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (raw === null) {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(INITIAL_SEEDS));
        return [...INITIAL_SEEDS];
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item && typeof item.query === 'string');
      }
    } catch (err) {
      console.warn('Unable to access localStorage for recent searches:', err);
    }
    return [];
  }

  function saveRecentSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    try {
      let list = getRecentSearches();
      list = list.filter((item) => item.query.toLowerCase() !== trimmed.toLowerCase());
      list.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        query: trimmed,
        timestamp: Date.now(),
      });
      list = list.slice(0, 8);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('Failed to save recent search:', err);
    }
  }

  function removeRecentSearch(id: string) {
    try {
      let list = getRecentSearches();
      list = list.filter((item) => item.id !== id);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('Failed to remove recent search:', err);
    }
  }

  function clearAllRecentSearches() {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
    } catch (err) {
      console.warn('Failed to clear recent searches:', err);
    }
  }

  function formatRelativeTime(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    if (diffMs < 60000) return 'Just now';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const searchForm = document.querySelector('#search-form') as HTMLFormElement | null;
  const searchInput = document.querySelector('#search-input') as HTMLInputElement | null;
  const searchButton = document.querySelector('#search-button') as HTMLButtonElement | null;
  const searchButtonText = document.querySelector('#search-button-text') as HTMLSpanElement | null;
  const clearSearchBtn = document.querySelector('#clear-search') as HTMLButtonElement | null;
  const recentDropdown = document.querySelector('#recent-searches-dropdown') as HTMLDivElement | null;
  const recentList = document.querySelector('#recent-searches-list') as HTMLUListElement | null;
  const recentEmpty = document.querySelector('#recent-searches-empty') as HTMLDivElement | null;
  const clearAllRecentBtn = document.querySelector('#clear-all-recent') as HTMLButtonElement | null;

  const div = document.querySelector('#presets') as HTMLDivElement;

  let highlightedIndex = -1;
  let currentFilteredSearches: RecentSearchItem[] = [];

  function showRecentSearches() {
    if (!recentDropdown) return;
    renderRecentSearches(searchInput?.value.trim() || '');
    recentDropdown.classList.remove('hidden');
  }

  function hideRecentSearches() {
    if (!recentDropdown) return;
    recentDropdown.classList.add('hidden');
    highlightedIndex = -1;
    updateHighlightedItem();
  }

  function updateHighlightedItem() {
    if (!recentList) return;
    const items = recentList.querySelectorAll<HTMLLIElement>('.recent-search-item');
    items.forEach((item, idx) => {
      if (idx === highlightedIndex) {
        item.classList.add('highlighted');
        item.setAttribute('aria-selected', 'true');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('highlighted');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }

  function renderRecentSearches(filterText = '') {
    if (!recentList || !recentEmpty || !clearAllRecentBtn) return;
    const all = getRecentSearches();
    const cleanFilter = filterText.toLowerCase();

    currentFilteredSearches = cleanFilter
      ? all.filter((item) => item.query.toLowerCase().includes(cleanFilter))
      : all;

    recentList.innerHTML = '';
    highlightedIndex = -1;

    if (currentFilteredSearches.length === 0) {
      recentEmpty.classList.remove('hidden');
      recentEmpty.textContent = cleanFilter ? `No recent searches matching "${filterText}"` : 'No recent searches yet';
      clearAllRecentBtn.style.display = all.length > 0 ? 'inline-block' : 'none';
      return;
    }

    recentEmpty.classList.add('hidden');
    clearAllRecentBtn.style.display = 'inline-block';

    currentFilteredSearches.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'recent-search-item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      const mainDiv = document.createElement('div');
      mainDiv.className = 'recent-search-main';

      const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      iconSvg.setAttribute('class', 'recent-search-icon');
      iconSvg.setAttribute('width', '15');
      iconSvg.setAttribute('height', '15');
      iconSvg.setAttribute('viewBox', '0 0 24 24');
      iconSvg.setAttribute('fill', 'none');
      iconSvg.setAttribute('stroke', 'currentColor');
      iconSvg.setAttribute('stroke-width', '2');
      iconSvg.setAttribute('stroke-linecap', 'round');
      iconSvg.setAttribute('stroke-linejoin', 'round');
      iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>';

      const textSpan = document.createElement('span');
      textSpan.className = 'recent-search-text';
      textSpan.textContent = item.query;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'recent-search-time';
      timeSpan.textContent = formatRelativeTime(item.timestamp);

      mainDiv.appendChild(iconSvg);
      mainDiv.appendChild(textSpan);
      mainDiv.appendChild(timeSpan);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'recent-search-delete';
      deleteBtn.setAttribute('aria-label', `Remove ${item.query} from recent searches`);
      deleteBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeRecentSearch(item.id);
        renderRecentSearches(searchInput?.value.trim() || '');
      });

      li.appendChild(mainDiv);
      li.appendChild(deleteBtn);

      li.addEventListener('click', () => {
        executeSearch(item.query);
      });

      li.addEventListener('mouseenter', () => {
        highlightedIndex = index;
        updateHighlightedItem();
      });

      recentList.appendChild(li);
    });
  }

  if (clearAllRecentBtn) {
    clearAllRecentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllRecentSearches();
      renderRecentSearches();
      if (searchInput) searchInput.focus();
    });
  }

  async function executeSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;

    saveRecentSearch(trimmed);
    hideRecentSearches();

    if (searchInput) {
      searchInput.value = trimmed;
      if (clearSearchBtn) clearSearchBtn.classList.remove('hidden');
    }

    const allButtons = div.querySelectorAll('button');
    allButtons.forEach((b) => (b.disabled = true));
    if (searchButton) searchButton.disabled = true;
    if (searchInput) searchInput.disabled = true;
    if (searchButtonText) searchButtonText.textContent = 'Exploring...';

    const isWorldwide = currentSelectedCountry === 'WORLDWIDE';
    const countryName = isWorldwide ? '' : currentSelectedCountry;
    const isAlreadyCountryScoped =
      !isWorldwide && trimmed.toLowerCase().includes(countryName.toLowerCase());

    const searchTarget =
      !isWorldwide && !isAlreadyCountryScoped ? `${trimmed}, ${countryName}` : trimmed;

    const customPrompt = isWorldwide
      ? `The user wants to explore this location or place: "${trimmed}". Explain what makes it fascinating or unique, and call recommendPlace with its accurate coordinates, name, and recommended zoom level to show it on Google Maps.`
      : `The user wants to explore this location or place strictly within ${countryName}: "${trimmed}". Find and describe this destination located inside ${countryName}, explain what makes it fascinating or unique in ${countryName}, and call recommendPlace with its accurate coordinates within ${countryName}, place name (including ${countryName}), and recommended zoom level to show it on Google Maps.`;

    if (
      trimmed.toLowerCase().includes('ancient myster') ||
      trimmed.toLowerCase() === 'ancient mysteries' ||
      trimmed.toLowerCase() === 'ancient ruins'
    ) {
      const multiPayload = getCuratedAncientMysteries(currentSelectedCountry);
      renderMultiResults(multiPayload);
      allButtons.forEach((b) => (b.disabled = false));
      if (searchButton) searchButton.disabled = false;
      if (searchInput) searchInput.disabled = false;
      if (searchButtonText) searchButtonText.textContent = 'Explore';
      return;
    }

    try {
      await generateContent(customPrompt, {
        searchQuery: searchTarget,
      });
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      allButtons.forEach((b) => (b.disabled = false));
      if (searchButton) searchButton.disabled = false;
      if (searchInput) searchInput.disabled = false;
      if (searchButtonText) searchButtonText.textContent = 'Explore';
    }
  }

  if (searchInput && clearSearchBtn) {
    searchInput.addEventListener('focus', () => {
      showRecentSearches();
    });

    searchInput.addEventListener('click', () => {
      showRecentSearches();
    });

    searchInput.addEventListener('input', () => {
      const val = searchInput.value.trim();
      if (val.length > 0) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
      showRecentSearches();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (recentDropdown && !recentDropdown.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (currentFilteredSearches.length > 0) {
            highlightedIndex = (highlightedIndex + 1) % currentFilteredSearches.length;
            updateHighlightedItem();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (currentFilteredSearches.length > 0) {
            highlightedIndex =
              highlightedIndex <= 0 ? currentFilteredSearches.length - 1 : highlightedIndex - 1;
            updateHighlightedItem();
          }
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
          e.preventDefault();
          const selected = currentFilteredSearches[highlightedIndex];
          if (selected) {
            executeSearch(selected.query);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideRecentSearches();
        }
      }
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchBtn.classList.add('hidden');
      renderRecentSearches('');
      showRecentSearches();
      searchInput.focus();
    });
  }

  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    const searchContainer = document.getElementById('search-container');
    if (searchContainer && !searchContainer.contains(target)) {
      hideRecentSearches();
    }
  });

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (!query) {
        searchInput.focus();
        return;
      }
      executeSearch(query);
    });
  }

  // Sidebar controls
  const sidebar = document.querySelector('#sidebar') as HTMLElement | null;
  const toggleSidebarBtn = document.querySelector('#toggle-sidebar-btn') as HTMLButtonElement | null;
  const openSidebarBtn = document.querySelector('#open-sidebar-btn') as HTMLButtonElement | null;
  const presetsCountBadge = document.querySelector('#presets-count') as HTMLElement | null;
  const filterButtons = document.querySelectorAll<HTMLButtonElement>('.preset-filter-btn');

  // Country Selector Controls inside Search section
  const countrySelect = document.querySelector('#country-select') as HTMLSelectElement | null;
  const countryActiveBadge = document.querySelector('#country-active-badge') as HTMLElement | null;
  const resetCountryBtn = document.querySelector('#reset-country-btn') as HTMLButtonElement | null;
  const takeMeSomewhereTitle = document.querySelector('#take-me-somewhere') as HTMLElement | null;
  const takeMeSomewhereSub = document.querySelector('#take-me-somewhere-sub') as HTMLElement | null;

  function applySelectedCountry(country: string, shouldPanMap: boolean = true) {
    currentSelectedCountry = country || 'WORLDWIDE';
    try {
      localStorage.setItem('gmp_selected_country_v1', currentSelectedCountry);
    } catch (e) {
      // ignore
    }

    if (countrySelect && countrySelect.value !== currentSelectedCountry) {
      countrySelect.value = currentSelectedCountry;
    }

    const isWorldwide = currentSelectedCountry === 'WORLDWIDE';
    const countryInfo = COUNTRIES_MAP[currentSelectedCountry] || COUNTRIES_MAP['WORLDWIDE'];

    if (countrySelect) {
      if (isWorldwide) {
        countrySelect.classList.remove('has-country');
      } else {
        countrySelect.classList.add('has-country');
      }
    }

    if (countryActiveBadge) {
      if (isWorldwide) {
        countryActiveBadge.classList.add('hidden');
      } else {
        countryActiveBadge.textContent = `${countryInfo.flag} ${countryInfo.name}`;
        countryActiveBadge.classList.remove('hidden');
      }
    }

    if (resetCountryBtn) {
      if (isWorldwide) {
        resetCountryBtn.classList.add('hidden');
      } else {
        resetCountryBtn.classList.remove('hidden');
      }
    }

    if (takeMeSomewhereTitle) {
      if (isWorldwide) {
        takeMeSomewhereTitle.textContent = 'Take me somewhere...';
      } else {
        takeMeSomewhereTitle.textContent = `Take me somewhere in ${countryInfo.name}...`;
      }
    }

    if (takeMeSomewhereSub) {
      if (isWorldwide) {
        takeMeSomewhereSub.textContent = 'Explore Earth with Gemini by mood, landscape, or wonder';
      } else {
        takeMeSomewhereSub.textContent = `Discover hidden wonders across ${countryInfo.name} with Gemini`;
      }
    }

    if (searchInput) {
      if (isWorldwide) {
        searchInput.placeholder = 'Search any place, city, or landmark...';
      } else {
        searchInput.placeholder = `Search places in ${countryInfo.name}...`;
      }
    }

    if (shouldPanMap && map) {
      map.panTo({ lat: countryInfo.lat, lng: countryInfo.lng });
      map.setZoom(countryInfo.zoom);
    }
  }

  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      applySelectedCountry(countrySelect.value, true);
    });
  }

  if (resetCountryBtn) {
    resetCountryBtn.addEventListener('click', () => {
      applySelectedCountry('WORLDWIDE', true);
    });
  }

  // Restore saved country selection
  let savedCountry = 'WORLDWIDE';
  try {
    savedCountry = localStorage.getItem('gmp_selected_country_v1') || 'WORLDWIDE';
  } catch (e) {
    savedCountry = 'WORLDWIDE';
  }
  applySelectedCountry(savedCountry, false);

  if (toggleSidebarBtn && sidebar && openSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', () => {
      sidebar.classList.add('collapsed');
      openSidebarBtn.classList.remove('hidden');
    });

    openSidebarBtn.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      openSidebarBtn.classList.add('hidden');
    });
  }

  let activeFilter = 'all';

  function renderPresets() {
    div.innerHTML = '';
    const filtered =
      activeFilter === 'all'
        ? presets
        : presets.filter((p) => p.category === activeFilter);

    if (presetsCountBadge) {
      presetsCountBadge.textContent = `${filtered.length} place${filtered.length === 1 ? '' : 's'}`;
    }

    for (const preset of filtered) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'preset-card';
      card.setAttribute('data-category', preset.category);
      card.setAttribute('aria-label', `Explore ${preset.title}: ${preset.subtitle}`);

      const header = document.createElement('div');
      header.className = 'preset-card-header';

      const icon = document.createElement('span');
      icon.className = 'preset-card-icon';
      icon.textContent = preset.icon;

      const title = document.createElement('span');
      title.className = 'preset-card-title';
      title.textContent = preset.title;

      header.appendChild(icon);
      header.appendChild(title);

      const sub = document.createElement('span');
      sub.className = 'preset-card-sub';
      sub.textContent = preset.subtitle;

      card.appendChild(header);
      card.appendChild(sub);

      card.addEventListener('click', async () => {
        hideRecentSearches();

        if (preset.id === 'ancient') {
          // Provide multiple search results so one can select from them
          const multiPayload = getCuratedAncientMysteries(currentSelectedCountry);
          renderMultiResults(multiPayload);
          return;
        }

        const allCards = div.querySelectorAll<HTMLButtonElement>('.preset-card');
        allCards.forEach((b) => (b.disabled = true));
        if (searchButton) searchButton.disabled = true;
        if (searchInput) searchInput.disabled = true;
        card.classList.add('active-exploring');

        const isWorldwide = currentSelectedCountry === 'WORLDWIDE';
        const countryName = isWorldwide ? '' : currentSelectedCountry;
        const fallbackPlace = getCuratedDestination(currentSelectedCountry, preset.id);

        const promptToUse = isWorldwide
          ? preset.prompt
          : `The user selected the country "${countryName}" and clicked the exploration theme "${preset.title}" (${preset.subtitle}). Recommend an extraordinary, real destination located strictly inside ${countryName}. Describe why it fits this theme in ${countryName}, and call recommendPlace with its accurate coordinates within ${countryName}, location name (including ${countryName}), and recommended zoom level.`;

        const searchQuery = isWorldwide ? preset.title : `${preset.title}, ${countryName}`;

        try {
          await generateContent(promptToUse, {
            fallbackPlace,
            searchQuery,
          });
        } catch (e) {
          console.error('Preset exploration error:', e);
        } finally {
          allCards.forEach((b) => (b.disabled = false));
          if (searchButton) searchButton.disabled = false;
          if (searchInput) searchInput.disabled = false;
          card.classList.remove('active-exploring');
        }
      });

      div.appendChild(card);
    }
  }

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      activeFilter = btn.dataset.filter || 'all';
      renderPresets();
    });
  });

  renderPresets();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main();
  });
} else {
  main();
}

