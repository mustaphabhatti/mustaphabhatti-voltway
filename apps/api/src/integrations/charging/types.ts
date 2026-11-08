export interface StartCommand {
  sessionId: string;
  portId: string;
  stationId: string;
  idTag: string;
  ocppConnectorId: number | null;
  chargePointId: string | null;
}

export interface ChargingController {
  kind: 'simulator' | 'ocpp';
  /** Ask the charger to start. Sessions become "active" when the charger confirms. */
  start(cmd: StartCommand): Promise<void>;
  stop(sessionId: string): Promise<void>;
  reserve?(args: { reservationId: string; portId: string; chargePointId: string | null; ocppConnectorId: number | null; expiresAt: Date; idTag: string }): Promise<void>;
  cancelReservation?(args: { reservationId: string; chargePointId: string | null }): Promise<void>;
}
