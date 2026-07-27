export type {
  BookingConfiguration,
  PriceResult,
  YesNo
} from "./pricing/types.js";

export interface CalendarEventRecord {
  petId?: string;
  type?: string | string[];
  start: string;
  end: string;
  name?: string;
  species?: string;
  breed?: string;
  colour?: string;
}

export interface CalendarCacheRecord {
  id: string;
  events: CalendarEventRecord[];
  savedAt: number;
}

export interface CalendarMetadata {
  sha256: string;
}

export interface BankHolidayEvent {
  title: string;
  date: string;
}

export interface BankHolidayRegion {
  events: BankHolidayEvent[];
}

export interface BankHolidayResponse {
  scotland: BankHolidayRegion;
  "england-and-wales": BankHolidayRegion;
}

export interface CalendarDot {
  date: Date;
  colour: string;
}

export interface HolidayEntry {
  date: Date;
}

export interface PetStayRange {
  checkIn: Date;
  checkOut: Date;
}

export interface OpenStay {
  open: Date | null;
  ranges: PetStayRange[];
  pet: CalendarEventRecord;
}

export interface ActivePetStay {
  pet: CalendarEventRecord;
  checkIn: Date;
  checkOut: Date;
}

export interface ChatSession {
  sessionId: string;
  nickname: string;
}

export interface ChatMessageRecord {
  text: string;
  sender: string;
  timestamp: number;
  sessionId: string;
  agent?: string | null;
  source?: string | null;
  isTypingSignal?: boolean;
  isAIMessage?: boolean;
  handedOffToHuman?: boolean;
  isWelcomeMessage?: boolean;
  messageID?: number;
}

export interface WikiSearchHit {
  pageid: number;
  title: string;
}

export interface WikiSearchResponse {
  query?: {
    search?: WikiSearchHit[];
  };
}

export interface WikiCategory {
  title: string;
}

export interface WikiCategoryResponse {
  query?: {
    pages?: Record<string, {
      categories?: WikiCategory[];
    }>;
  };
}

export interface TaxiCoverageEntry {
  town?: string;
}

export interface TaxiFormElements {
  pickup: HTMLSelectElement;
  dropoff: HTMLSelectElement;
  pickupEnabled: HTMLInputElement;
  dropoffEnabled: HTMLInputElement;
  different: HTMLInputElement;
  dropoffGroup: HTMLElement;
}

export interface TaxiPriceResponse {
  price: number | string;
}
