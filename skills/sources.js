// Public endpoints, Jihu first. Building or installing never uploads resources.
export const sources = {
  library: 'nora-skills',
  catalogueUrls: [
    'https://jihulab.com/LoveMaker-art/nora-tavern/-/raw/main/skills/catalogue.json',
    'https://noratavern.com/skills/catalogue.json'
  ],
  packageBases: [
    'https://jihulab.com/api/v4/projects/378185/packages/generic/nora-skills/',
    'https://noratavern.com/skills/packages/'
  ]
};
export function packageUrls(skill) {
  const filename=skill.package.split('/').pop();
  return [sources.packageBases[0]+encodeURIComponent(skill.id+'-'+skill.version)+'/'+encodeURIComponent(filename),sources.packageBases[1]+encodeURIComponent(filename)];
}
