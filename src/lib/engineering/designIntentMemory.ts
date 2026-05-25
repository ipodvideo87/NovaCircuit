export interface DesignIntentFact {
  id: string;
  targetType: 'component' | 'net' | 'board' | 'constraint' | 'subsystem';
  targetId: string; // designator, netId, or general tag
  intentionText: string;
  category: 'thermal' | 'rf_coupling' | 'bypass_decoupling' | 'power_integrity' | 'impedance' | 'general';
  severity: 'critical' | 'normal' | 'optional';
  timestamp: number;
}

export class DesignIntentMemory {
  private facts: DesignIntentFact[] = [];

  constructor() {
    this.facts = [];
    // Inject default structural rules representing production-grade systems
    this.recordFact({
      targetType: 'board',
      targetId: 'PDN_STAGE',
      intentionText: 'Primary power paths must prioritize copper thickness and low loop-inductance via patterns.',
      category: 'power_integrity',
      severity: 'critical'
    });
    this.recordFact({
      targetType: 'constraint',
      targetId: 'DIFF_PAIR_SKEW',
      intentionText: 'All differential lines must match length skew boundaries under 0.15mm.',
      category: 'impedance',
      severity: 'critical'
    });
  }

  /**
   * Add a new design rationale fact into the engineering context database.
   */
  public recordFact(factInput: Omit<DesignIntentFact, 'id' | 'timestamp'>): DesignIntentFact {
    const fact: DesignIntentFact = {
      ...factInput,
      id: `intent-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now()
    };
    this.facts.push(fact);
    return fact;
  }

  /**
   * Returns intent rationale that applies directly or indirectly to components or nets.
   */
  public queryFactsByTarget(targetId: string): DesignIntentFact[] {
    const lowerId = targetId.toLowerCase();
    return this.facts.filter(
      fact => fact.targetId.toLowerCase() === lowerId || 
              fact.intentionText.toLowerCase().includes(lowerId)
    );
  }

  /**
   * Get all registered design intent rationale records.
   */
  public getAllFacts(): DesignIntentFact[] {
    return [...this.facts];
  }

  /**
   * Delete specific rationale constraint by reference identifier.
   */
  public removeFact(id: string): boolean {
    const index = this.facts.findIndex(f => f.id === id);
    if (index !== -1) {
      this.facts.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Wipe all registered intentions.
   */
  public clearFacts(): void {
    this.facts = [];
  }
}
