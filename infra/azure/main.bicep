targetScope = 'subscription'

param environmentName string
param location string = 'northeurope'
@secure()
param postgresAdminPassword string
@secure()
param sessionSecret string
@secure()
param internalTokenSecret string
@secure()
param voiceAgentServiceSecret string
@secure()
param livekitUrl string
@secure()
param livekitApiKey string
@secure()
param livekitApiSecret string
@secure()
param openaiApiKey string
@secure()
param deepgramApiKey string
@secure()
param elevenlabsApiKey string
@secure()
param elevenlabsVoiceId string
@secure()
param googleClientId string
param tags object = {}

var mergedTags = union(tags, { 'azd-env-name': environmentName, workload: 'montenegrina' })
var token = toLower(uniqueString(subscription().id, environmentName, location))

resource resourceGroup 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: mergedTags
}

module resources 'resources.bicep' = {
  name: 'montenegrina-resources'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    resourceToken: token
    tags: mergedTags
    postgresAdminPassword: postgresAdminPassword
    sessionSecret: sessionSecret
    internalTokenSecret: internalTokenSecret
    voiceAgentServiceSecret: voiceAgentServiceSecret
    livekitUrl: livekitUrl
    livekitApiKey: livekitApiKey
    livekitApiSecret: livekitApiSecret
    openaiApiKey: openaiApiKey
    deepgramApiKey: deepgramApiKey
    elevenlabsApiKey: elevenlabsApiKey
    elevenlabsVoiceId: elevenlabsVoiceId
    googleClientId: googleClientId
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.registryName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryEndpoint
output SERVICE_WEB_NAME string = resources.outputs.webName
output SERVICE_API_NAME string = resources.outputs.apiName
output SERVICE_WORKER_NAME string = resources.outputs.workerName
output SERVICE_VOICE_AGENT_NAME string = resources.outputs.voiceAgentName
output SERVICE_KNOWLEDGE_PARSER_NAME string = resources.outputs.parserName
output SERVICE_MIGRATION_JOB_NAME string = resources.outputs.migrationJobName
output SERVICE_SEED_JOB_NAME string = resources.outputs.seedJobName
output SERVICE_WEB_URI string = resources.outputs.webUri
output SERVICE_API_URI string = resources.outputs.apiUri
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
