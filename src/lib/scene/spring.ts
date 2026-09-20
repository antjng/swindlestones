export class Spring {
  velocity = 0;

  constructor(
    public value = 0,
    private readonly stiffness = 120,
    private readonly damping = 14,
  ) {}

  update(deltaSeconds: number, target: number): number {
    // Sub-step so a long frame can't make the spring explode.
    const steps = Math.max(1, Math.ceil(deltaSeconds / 0.016));
    const dt = deltaSeconds / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (this.stiffness * (target - this.value) - this.damping * this.velocity) * dt;
      this.value += this.velocity * dt;
    }
    return this.value;
  }

  snapTo(value: number): void {
    this.value = value;
    this.velocity = 0;
  }
}
