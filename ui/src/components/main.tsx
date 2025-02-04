import { Component, linkEvent } from 'inferno';
import { Link } from 'inferno-router';
import { Subscription } from "rxjs";
import { retryWhen, delay, take } from 'rxjs/operators';
import { UserOperation, CommunityUser, GetFollowedCommunitiesResponse, ListCommunitiesForm, ListCommunitiesResponse, Community, SortType, GetSiteResponse, ListingType, SiteResponse, GetPostsResponse, CreatePostLikeResponse, Post, GetPostsForm } from '../interfaces';
import { WebSocketService, UserService } from '../services';
import { PostListings } from './post-listings';
import { SiteForm } from './site-form';
import { msgOp, repoUrl, mdToHtml, fetchLimit, routeSortTypeToEnum, routeListingTypeToEnum } from '../utils';

interface MainState {
  subscribedCommunities: Array<CommunityUser>;
  trendingCommunities: Array<Community>;
  site: GetSiteResponse;
  showEditSite: boolean;
  loading: boolean;
  posts: Array<Post>;
  type_: ListingType;
  sort: SortType;
  page: number;
}

export class Main extends Component<any, MainState> {

  private subscription: Subscription;
  private emptyState: MainState = {
    subscribedCommunities: [],
    trendingCommunities: [],
    site: {
      op: null,
      site: {
        id: null,
        name: null,
        creator_id: null,
        creator_name: null,
        published: null,
        number_of_users: null,
        number_of_posts: null,
        number_of_comments: null,
      },
      admins: [],
      banned: [],
    },
    showEditSite: false,
    loading: true,
    posts: [],
    type_: this.getListingTypeFromProps(this.props),
    sort: this.getSortTypeFromProps(this.props),
    page: this.getPageFromProps(this.props),
  }

  getListingTypeFromProps(props: any): ListingType {
    return (props.match.params.type) ? 
      routeListingTypeToEnum(props.match.params.type) : 
      UserService.Instance.user ? 
      ListingType.Subscribed : 
      ListingType.All;
  }

  getSortTypeFromProps(props: any): SortType {
    return (props.match.params.sort) ? 
      routeSortTypeToEnum(props.match.params.sort) : 
      SortType.Hot;
  }

  getPageFromProps(props: any): number {
    return (props.match.params.page) ? Number(props.match.params.page) : 1;
  }

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;
    this.handleEditCancel = this.handleEditCancel.bind(this);

    this.subscription = WebSocketService.Instance.subject
    .pipe(retryWhen(errors => errors.pipe(delay(3000), take(10))))
    .subscribe(
      (msg) => this.parseMessage(msg),
        (err) => console.error(err),
        () => console.log('complete')
    );

    WebSocketService.Instance.getSite();

    if (UserService.Instance.user) {
      WebSocketService.Instance.getFollowedCommunities();
    }

    let listCommunitiesForm: ListCommunitiesForm = {
      sort: SortType[SortType.Hot],
      limit: 6
    }

    WebSocketService.Instance.listCommunities(listCommunitiesForm);

    this.fetchPosts();
  }

  componentWillUnmount() {
    this.subscription.unsubscribe();
  }

  // Necessary for back button for some reason
  componentWillReceiveProps(nextProps: any) {
    if (nextProps.history.action == 'POP') {
      this.state = this.emptyState;
      this.state.type_ = this.getListingTypeFromProps(nextProps);
      this.state.sort = this.getSortTypeFromProps(nextProps);
      this.state.page = this.getPageFromProps(nextProps);
      this.fetchPosts();
    }
  }

  render() {
    return (
      <div class="container">
        <div class="row">
          <div class="col-12 col-md-8">
            {this.posts()}
          </div>
          <div class="col-12 col-md-4">
            {!this.state.loading &&
              <div>
                {this.trendingCommunities()}
                {UserService.Instance.user && this.state.subscribedCommunities.length > 0 && 
                  <div>
                    <h5>Subscribed <Link class="text-white" to="/communities">communities</Link></h5> 
                    <ul class="list-inline"> 
                      {this.state.subscribedCommunities.map(community =>
                        <li class="list-inline-item"><Link to={`/c/${community.community_name}`}>{community.community_name}</Link></li>
                      )}
                    </ul>
                  </div>
                }
                <Link class="btn btn-sm btn-secondary btn-block mb-3" 
                  to="/create_community">Create a Community</Link>
                {this.sidebar()}
              </div>
            }
          </div>
        </div>
      </div>
    )
  }

  trendingCommunities() {
    return (
      <div>
        <h5>Trending <Link class="text-white" to="/communities">communities</Link></h5> 
        <ul class="list-inline"> 
          {this.state.trendingCommunities.map(community =>
            <li class="list-inline-item"><Link to={`/c/${community.name}`}>{community.name}</Link></li>
          )}
        </ul>
      </div>
    )
  }

  sidebar() {
    return (
      <div>
        {!this.state.showEditSite ?
          this.siteInfo() :
          <SiteForm
            site={this.state.site.site} 
            onCancel={this.handleEditCancel} 
          />
        }
        {this.landing()}
      </div>
    )
  }

  updateUrl() {
    let typeStr = ListingType[this.state.type_].toLowerCase();
    let sortStr = SortType[this.state.sort].toLowerCase();
    this.props.history.push(`/home/type/${typeStr}/sort/${sortStr}/page/${this.state.page}`);
  }

  siteInfo() {
    return (
      <div>
        <h5 class="mb-0">{`${this.state.site.site.name}`}</h5>
        {this.canAdmin && 
          <ul class="list-inline mb-1 text-muted small font-weight-bold"> 
            <li className="list-inline-item">
              <span class="pointer" onClick={linkEvent(this, this.handleEditClick)}>edit</span>
            </li>
          </ul>
        }
        <ul class="my-2 list-inline">
          <li className="list-inline-item badge badge-light">{this.state.site.site.number_of_users} Users</li>
          <li className="list-inline-item badge badge-light">{this.state.site.site.number_of_posts} Posts</li>
          <li className="list-inline-item badge badge-light">{this.state.site.site.number_of_comments} Comments</li>
          <li className="list-inline-item"><Link className="badge badge-light" to="/modlog">Modlog</Link></li>
        </ul>
        <ul class="my-1 list-inline small"> 
          <li class="list-inline-item">admins: </li>
          {this.state.site.admins.map(admin =>
            <li class="list-inline-item"><Link class="text-info" to={`/u/${admin.name}`}>{admin.name}</Link></li>
          )}
        </ul>
        {this.state.site.site.description && 
          <div>
            <hr />
            <div className="md-div" dangerouslySetInnerHTML={mdToHtml(this.state.site.site.description)} />
            <hr />
          </div>
        }
      </div>
    )
  }

  landing() {
    return (
      <div>
        <h5>Powered by  
          <svg class="icon mx-2"><use xlinkHref="#icon-mouse"></use></svg>
          <a href={repoUrl}>Lemmy<sup>Beta</sup></a>
        </h5>
        <p>Lemmy is a <a href="https://en.wikipedia.org/wiki/Link_aggregation">link aggregator</a> / reddit alternative, intended to work in the <a href="https://en.wikipedia.org/wiki/Fediverse">fediverse</a>.</p>
        <p>Its self-hostable, has live-updating comment threads, and is tiny (<code>~80kB</code>). Federation into the ActivityPub network is on the roadmap.</p>
        <p>This is a <b>very early beta version</b>, and a lot of features are currently broken or missing.</p>
        <p>Suggest new features or report bugs <a href={repoUrl}>here.</a></p>
        <p>Made with <a href="https://www.rust-lang.org">Rust</a>, <a href="https://actix.rs/">Actix</a>, <a href="https://www.infernojs.org">Inferno</a>, <a href="https://www.typescriptlang.org/">Typescript</a>.</p>
      </div>
    )
  }

  posts() {
    return (
      <div>
        {this.state.loading ? 
        <h5><svg class="icon icon-spinner spin"><use xlinkHref="#icon-spinner"></use></svg></h5> : 
        <div>
          {this.selects()}
          <PostListings posts={this.state.posts} showCommunity />
          {this.paginator()}
        </div>
        }
      </div>
    )
  }

  selects() {
    return (
      <div className="mb-2">
        <div class="btn-group btn-group-toggle">
          <label className={`btn btn-sm btn-secondary 
            ${this.state.type_ == ListingType.Subscribed && 'active'}
            ${UserService.Instance.user == undefined ? 'disabled' : 'pointer'}
            `}>
            <input type="radio" 
              value={ListingType.Subscribed}
              checked={this.state.type_ == ListingType.Subscribed}
              onChange={linkEvent(this, this.handleTypeChange)}
              disabled={UserService.Instance.user == undefined}
            />
            Subscribed
          </label>
          <label className={`pointer btn btn-sm btn-secondary ${this.state.type_ == ListingType.All && 'active'}`}>
            <input type="radio" 
              value={ListingType.All}
              checked={this.state.type_ == ListingType.All}
              onChange={linkEvent(this, this.handleTypeChange)}
            /> 
            All
          </label>
        </div>
        <select value={this.state.sort} onChange={linkEvent(this, this.handleSortChange)} class="ml-2 custom-select custom-select-sm w-auto">
          <option disabled>Sort Type</option>
          <option value={SortType.Hot}>Hot</option>
          <option value={SortType.New}>New</option>
          <option disabled>──────────</option>
          <option value={SortType.TopDay}>Top Day</option>
          <option value={SortType.TopWeek}>Week</option>
          <option value={SortType.TopMonth}>Month</option>
          <option value={SortType.TopYear}>Year</option>
          <option value={SortType.TopAll}>All</option>
        </select>
      </div>
    )
  }

  paginator() {
    return (
      <div class="mt-2">
        {this.state.page > 1 && 
          <button class="btn btn-sm btn-secondary mr-1" onClick={linkEvent(this, this.prevPage)}>Prev</button>
        }
        <button class="btn btn-sm btn-secondary" onClick={linkEvent(this, this.nextPage)}>Next</button>
      </div>
    );
  }

  get canAdmin(): boolean {
    return UserService.Instance.user && this.state.site.admins.map(a => a.id).includes(UserService.Instance.user.id);
  }

  handleEditClick(i: Main) {
    i.state.showEditSite = true;
    i.setState(i.state);
  }

  handleEditCancel() {
    this.state.showEditSite = false;
    this.setState(this.state);
  }

  nextPage(i: Main) { 
    i.state.page++;
    i.setState(i.state);
    i.updateUrl();
    i.fetchPosts();
  }

  prevPage(i: Main) { 
    i.state.page--;
    i.setState(i.state);
    i.updateUrl();
    i.fetchPosts();
  }

  handleSortChange(i: Main, event: any) {
    i.state.sort = Number(event.target.value);
    i.state.page = 1;
    i.setState(i.state);
    i.updateUrl();
    i.fetchPosts();
  }

  handleTypeChange(i: Main, event: any) {
    i.state.type_ = Number(event.target.value);
    i.state.page = 1;
    i.setState(i.state);
    i.updateUrl();
    i.fetchPosts();
  }

  fetchPosts() {
    let getPostsForm: GetPostsForm = {
      page: this.state.page,
      limit: fetchLimit,
      sort: SortType[this.state.sort],
      type_: ListingType[this.state.type_]
    }
    WebSocketService.Instance.getPosts(getPostsForm);
  }

  parseMessage(msg: any) {
    console.log(msg);
    let op: UserOperation = msgOp(msg);
    if (msg.error) {
      alert(msg.error);
      return;
    } else if (op == UserOperation.GetFollowedCommunities) {
      let res: GetFollowedCommunitiesResponse = msg;
      this.state.subscribedCommunities = res.communities;
      this.setState(this.state);
    } else if (op == UserOperation.ListCommunities) {
      let res: ListCommunitiesResponse = msg;
      this.state.trendingCommunities = res.communities;
      this.setState(this.state);
    } else if (op == UserOperation.GetSite) {
      let res: GetSiteResponse = msg;

      // This means it hasn't been set up yet
      if (!res.site) {
        this.context.router.history.push("/setup");
      }
      this.state.site.admins = res.admins;
      this.state.site.site = res.site;
      this.state.site.banned = res.banned;
      this.setState(this.state);
      document.title = `${WebSocketService.Instance.site.name}`;

    } else if (op == UserOperation.EditSite) {
      let res: SiteResponse = msg;
      this.state.site.site = res.site;
      this.state.showEditSite = false;
      this.setState(this.state);
    } else if (op == UserOperation.GetPosts) {
      let res: GetPostsResponse = msg;
      this.state.posts = res.posts;
      this.state.loading = false;
      window.scrollTo(0,0);
      this.setState(this.state);
    } else if (op == UserOperation.CreatePostLike) {
      let res: CreatePostLikeResponse = msg;
      let found = this.state.posts.find(c => c.id == res.post.id);
      found.my_vote = res.post.my_vote;
      found.score = res.post.score;
      found.upvotes = res.post.upvotes;
      found.downvotes = res.post.downvotes;
      this.setState(this.state);
    }
  }
}

