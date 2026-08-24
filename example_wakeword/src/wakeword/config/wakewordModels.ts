export interface InstanceConfig {
  id: string;
  modelName: string;
  threshold: number;
  bufferCnt: number;
  sticky: boolean;
  msBetweenCallbacks: number;
}

export const heyLookdeepModelName = 'hey_lookdeep.dm';
export const heyCoachModelName = 'hey_coach.dm';

export const instanceConfigs: InstanceConfig[] = [
  {
    id: 'multi_model_instance',
    modelName: heyLookdeepModelName,
    threshold: 0.99,
    bufferCnt: 2,
    sticky: false,
    msBetweenCallbacks: 1000,
  },
  {
    id: 'multi_model_instance',
    modelName: heyCoachModelName,
    threshold: 0.99,
    bufferCnt: 2,
    sticky: false,
    msBetweenCallbacks: 1000,
  },
];
