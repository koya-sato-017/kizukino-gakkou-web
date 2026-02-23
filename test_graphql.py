import requests
import base64

def fetch_episodes(channel_id, first=50, after=None):
    url = "https://stand.fm/api/graphql"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    
    encoded_id = base64.b64encode(f"Channel:{channel_id}".encode()).decode()
    
    query = """
    query ChannelEpisodesFragmentPaginationQuery($after: String, $first: Int = 10, $id: ID!) {
      node(id: $id) {
        ... on Channel {
          episodes(first: $first, after: $after) {
            edges {
              node {
                episodeId
                title
                totalDuration
                publishedAt
                isSupporterOnly
              }
              cursor
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    }
    """
    
    variables = {
        "id": encoded_id,
        "first": first
    }
    if after:
        variables["after"] = after
        
    response = requests.post(url, json={"query": query, "variables": variables}, headers=headers)
    print(response.status_code)
    try:
        data = response.json()
        print(data)
    except Exception as e:
        print(e)
        print(response.text[:200])

if __name__ == "__main__":
    fetch_episodes("606297aabe8d4428b912db34")
