/**
 * AggregateRoot Base Class
 *
 * Event Sourcing pattern の基盤クラス
 */

import { DomainEvent } from './DomainEvent';

export abstract class AggregateRoot {
  private _uncommittedEvents: DomainEvent[] = [];
  private _version: number = 0;

  protected apply(event: DomainEvent): void {
    this.applyEvent(event);
    this._uncommittedEvents.push(event);
    this._version++;
  }

  protected abstract applyEvent(event: DomainEvent): void;

  getUncommittedEvents(): DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  get version(): number {
    return this._version;
  }
}
