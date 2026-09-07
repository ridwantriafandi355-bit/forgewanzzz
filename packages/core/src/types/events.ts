export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: string;
  payload: T;
}
