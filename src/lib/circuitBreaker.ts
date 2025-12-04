export class CircuitBreaker {
  private failures = 0
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED"
  private nextAttempt = 0

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownTime = 30000 
  ) {}

  public canRequest() {
    if (this.state === "OPEN") {
      if (Date.now() > this.nextAttempt) {
        this.state = "HALF_OPEN"
        return true
      }
      return false
    }
    return true
  }

  public success() {
    this.failures = 0
    this.state = "CLOSED"
  }

  public failure() {
    this.failures++

    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN"
      this.nextAttempt = Date.now() + this.cooldownTime
    }
  }

  public getState() {
    return this.state
  }
}
