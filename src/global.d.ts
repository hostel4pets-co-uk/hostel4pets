interface MobileDetectInstance {
  mobile(): string | null;
  tablet(): string | null;
}

interface MobileDetectConstructor {
  new (userAgent: string): MobileDetectInstance;
}

declare const MobileDetect: MobileDetectConstructor;

interface PurifyConfiguration {
  ALLOWED_TAGS: string[];
  ALLOWED_ATTR: string[];
}

interface PurifyApi {
  sanitize(value: string, configuration: PurifyConfiguration): string;
}

declare const DOMPurify: PurifyApi;

interface ChatApplication {
  clearChat(): void;
}

interface ChatApplicationConstructor {
  new (): ChatApplication;
}

interface Window {
  md?: MobileDetectInstance;
  shell?: HTMLDivElement;
  ChatApp?: ChatApplicationConstructor;
  chatApp?: ChatApplication;
  h4pCalendarEvents?: CalendarEventRecord[];
  guestColourMap?: Record<string, string>;
  colourHistory?: string[];
  loadDayView?: () => Promise<void>;
  taxiPrice?: number;
  __isAgentApp?: boolean;
}

interface BookingDatesChangedDetail {
  checkIn: Date;
  checkOut: Date;
}

interface DocumentEventMap {
  "booking:datesChanged": CustomEvent<BookingDatesChangedDetail>;
  "booking:priceChanged": Event;
}
