export type CrawlStatus = 'pending' | 'active' | 'completed'
export type PubStatus = 'upcoming' | 'current' | 'visited'

export interface Crawl {
  id: string
  name: string
  subtitle: string | null
  donation_url: string | null
  date: string
  start_time: string | null  // HH:MM:SS from postgres time type
  status: CrawlStatus
  join_token: string
  walking_speed_kmh: number
  created_at: string
}

export interface Pub {
  id: string
  crawl_id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  order_index: number
  is_meeting_point: boolean
  planned_dwell_minutes: number
  status: PubStatus
  planned_arrival_at: string | null
  actual_arrival_at: string | null
  actual_departure_at: string | null
  walking_minutes_to_next: number | null
  created_at: string
}

export interface LiveLocation {
  id: string
  crawl_id: string
  lat: number
  lng: number
  updated_at: string
}

export interface Rating {
  id: string
  pub_id: string
  participant_token: string
  score: number
  comment: string | null
  created_at: string
}

export interface PubWithRatings extends Pub {
  ratings: Rating[]
  avg_rating: number | null
  rating_count: number
}

export interface Leader {
  id: string
  crawl_id: string
  name: string
  token: string
  created_at: string
}

export interface DrinkTotals {
  beers: number
  wine: number
  cocktails: number
  shots: number
  soft_drinks: number
}

export interface DrinkLog extends DrinkTotals {
  pub_id: string
  participant_token: string
}

export interface LeaderLocation {
  id: string
  crawl_id: string
  leader_id: string
  leader_name: string
  lat: number
  lng: number
  updated_at: string
}
