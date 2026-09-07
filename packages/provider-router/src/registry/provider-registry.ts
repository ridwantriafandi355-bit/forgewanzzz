import type { ProviderDescriptor, ModelDescriptor } from "../types/provider.js";
import { ProviderNotFoundError, ModelNotFoundError } from "../types/router.js";

export class ProviderRegistry {
  private providers = new Map<string, ProviderDescriptor>();
  private models = new Map<string, ModelDescriptor>();

  registerProvider(provider: ProviderDescriptor): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(providerId: string): ProviderDescriptor {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderNotFoundError(providerId);
    }
    return provider;
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getAllProviders(): ProviderDescriptor[] {
    return Array.from(this.providers.values());
  }

  registerModel(model: ModelDescriptor): void {
    if (!this.providers.has(model.providerId)) {
      throw new ProviderNotFoundError(model.providerId);
    }
    this.models.set(model.id, model);
  }

  getModel(modelId: string): ModelDescriptor {
    const model = this.models.get(modelId);
    if (!model) {
      throw new ModelNotFoundError(modelId);
    }
    return model;
  }

  hasModel(modelId: string): boolean {
    return this.models.has(modelId);
  }

  getAllModels(): ModelDescriptor[] {
    return Array.from(this.models.values());
  }

  getModelsForProvider(providerId: string): ModelDescriptor[] {
    return this.getAllModels().filter((m) => m.providerId === providerId);
  }
}
