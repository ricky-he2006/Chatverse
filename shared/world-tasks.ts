export type GameTask = {
  id: string;
  game: string;
  title: string;
  objective: string;
  unit: 'members' | 'teams' | 'single';
  target: number;
  requireStreamer:boolean;
  channel:string;
  communityName:string;
  opensAt: number;
  deadline: number;
  reviewDeadline: number;
  status: 'open' | 'finalized';
  rewards: number[];
};
export type TaskProof = {
  role:'member'|'streamer';
  id: string;
  taskId: string;
  realm: string;
  name: string;
  note: string;
  receivedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  mime: string;
};
export type TaskStanding = {
  realm: string;
  name: string;
  approved: number;
  pending: number;
  streamerApproved:boolean;
  streamerPending:boolean;
  target: number;
  finishedAt: number | null;
  place: number | null;
  points: number;
  final: boolean;
};
export type WorldTasksState = {
  mode: 'simulation' | 'live';
  now: number;
  scope: 'local-simulation' | 'local-live';
  tasks: (GameTask & { standings: TaskStanding[]; myProofs?: TaskProof[] })[];
};
