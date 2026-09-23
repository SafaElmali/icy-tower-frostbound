/** Explicit payload boundary shared by browser and server analytics. */
export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

const PROPERTY_KEYS = new Set(
  `
app prior_round next_round previous_duration_ms quality_fallback result_reason verified_floor
shove_attempts shove_accepted respawn_count fallback_reason parent_operation_id pause_duration_s
step_duration_s selection_source entry_surface skill_goals_completed recording_unavailable criterion
context_type schema_version app_version environment surface run_id mode run_context rules_version
feature_version input_type device_proxy start_source start_reason previous_run_id visit_run_ordinal
ghost_enabled guidance_enabled daily_date target_floor target_score load_id load_duration_ms stage
error_code elapsed_ms score floor best_combo gems wall_rebounds active_duration_s elapsed_duration_s
failure_kind personal_best_floor personal_best_score hits dodges stomps frenzies reason phase
pause_duration_ms view destination source step_id step active_time_s attempt_id guidance_attempt_id
goal_id previous_goal_id challenge_id outcome milestone item_id slot previous_item_id share_type
method operation_id valid link_type result date previous_floor previous_score floor_beaten
score_beaten beaten ghost_floor new_ghost ghost_unavailable ranked_mode entry_source
submission_eligible request_id latency_ms result_count status rank top_50 submission_attempt_id
persisted role ready round analytics_room_id room_id target_floor time_limit_s bumping winner
host_floor guest_floor host_result guest_result restored retry_count outage_duration_ms transport
state checkpoint_floor respawn_ordinal action previous_mode new_mode panel setting previous_value
value enabled quality subsystem operation record_count context actor feature status_code duration_ms
recovery_duration_ms failure_reason time_seconds goals_completed quick_challenges_completed
quick_challenges_failed quick_challenges_missed run_number tutorial_enabled ghost_available is_retry
is_automated result_kind connection_id requested_ready error_category duration_s active_duration_ms
completion_count source_surface previous_quality current_quality setting_name completed skipped
steps_completed selected_goal_id previous_selected_goal_id time_to_complete_s first_run rules daily
challenge fullscreen host_score guest_score count ready_count player_count is_host restored_session
changed_setting previous_target_floor previous_duration_s previous_bumping previous_state new_state
peer_state previous_transport timing phase_before finish_kind new_floor new_score entry_point
start_method session_run_index cause total_paused_ms wall_jumps active_time_ms duration_wall_ms
has_ghost has_guidance guidance_step input_method feature_name previous new_value floor_target
score_target recording_available target_beaten score_target_beaten improved_floor improved_score
result_floor result_score server_verified link_result link_kind error_type duration_limit_s round_id
pause_reason resume_reason completion_kind exported_runs source_mode goal_count guidance_attempt
run_index previous_status current_status retry previous_round expected_phase actual_phase elapsed_s
result_source connection_state previous_connection_state transport_state recovery_ms
host_finish_kind guest_finish_kind time_limit previous_time_limit attempt_kind role_count is_top_50
initial_mode elapsed_time_ms load_stage item_slot milestone_floor settings_changed season
`.split(/\s+/),
);

export function cleanProperties(
  properties: AnalyticsProperties = {},
): AnalyticsProperties {
  const result: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!PROPERTY_KEYS.has(key) || value === undefined) continue;
    if (value === null || typeof value === 'boolean') result[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value))
      result[key] = value;
    else if (
      typeof value === 'string' &&
      value.length <= 200 &&
      !/https?:\/\/|Bearer\s|ph[ctx]_/.test(value)
    )
      result[key] = value;
  }
  return result;
}

export function analyticsRoute(path: string): string {
  return path === '/race' || path === '/how-to-play' ? path : '/';
}

export function incomingLink(search: string): string {
  const query = new URLSearchParams(search);
  const kinds = ['daily', 'challenge', 'room'].filter((key) => query.has(key));
  return kinds.length > 1 ? 'mixed' : (kinds[0] ?? 'none');
}

export function validEvent(name: string): boolean {
  return name === '$pageview' || /^[a-z][a-z0-9_]{2,79}$/.test(name);
}

export function analyticsHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
