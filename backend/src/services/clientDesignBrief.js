'use strict';

// Only design fields are sent to the AI; owner contact details and documents stay private.
function collect(project) {
  const c = project.construction_context || {};
  const a = { ...(c.intentAnswers || {}), ...(c.projectRequirements || {}) };
  const land = c.landSite || {};
  const fields = ['floors','built_up_area','qty_bedrooms','qty_bathrooms','qty_living','qty_dining','qty_kitchen','qty_pooja','qty_study','qty_guest','custom_rooms','size_master_bedroom','size_bedroom_2','size_living','size_kitchen','size_dining','size_pooja','size_study','car_parking','two_wheeler_parking','covered_parking','ev_charging','parking_checks','home_features','family_members','elderly_members','arch_style','interior_style','exterior_wall','roof_type','flooring_pref','wall_finish','door_style','window_style','kitchen_style','bathroom_style','follow_vastu','entrance_direction','pooja_direction','kitchen_direction','vastu_notes','special_requirements','things_to_avoid','material_preference','quality','has_terrace'];
  const inputs = Object.fromEntries(fields.filter(k => a[k] !== undefined).map(k => [k,a[k]]));
  inputs.plot_length = land.plot_length_ft ?? a.plot_length ?? project.plot_length;
  inputs.plot_width = land.plot_width_ft ?? a.plot_width ?? project.plot_width;
  inputs.road_facing = land.road_facing ?? a.road_facing ?? project.road_facing;
  for (const side of ['front','rear','left','right']) inputs[`setback_${side}_ft`] = land[`setback_${side}_ft`] ?? a[`setback_${side}_ft`];
  const warnings = [];
  for (const [k,v] of Object.entries(inputs)) {
    if (k.startsWith('size_') && Number(v) > 0 && Number(v) < 25) warnings.push(`${k.replaceAll('_',' ')} is ${v} sq.ft. This is too small for a usable room; the concept proposes a replacement. Correct it in Requirements → Room details.`);
  }
  const area = Number(inputs.built_up_area ?? project.built_up_area);
  if (area > 0 && area < 150) warnings.push(`Built-up area is ${area} sq.ft. It cannot accommodate the requested home; the concept uses the plot envelope. Correct Built-up area in Requirements → Building configuration.`);
  return { inputs, warnings };
}

function enforceSavedProgram(base, proposal) {
  // The initial generation may arrange rooms, but may not remove the client's room program.
  proposal.site = structuredClone(base.site);
  proposal.building = structuredClone(base.building);
  proposal.projectName = base.projectName;
  proposal.storeys = structuredClone(base.storeys);
  proposal.rooms = base.rooms.map((room, index) => {
    const suggested = proposal.rooms.find(r => r.name === room.name && r.type === room.type);
    return { ...room, storeyIndex: suggested && Number.isInteger(suggested.storeyIndex) && suggested.storeyIndex >= 0 && suggested.storeyIndex < base.building.floors ? suggested.storeyIndex : room.storeyIndex };
  });
  return proposal;
}
module.exports = { collect, enforceSavedProgram };
